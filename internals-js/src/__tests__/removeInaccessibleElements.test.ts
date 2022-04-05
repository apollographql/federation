import {
  errorCauses,
  InterfaceType,
  ObjectType,
  UnionType,
} from "../definitions";
import { buildSchema } from "../buildSchema";
import { removeInaccessibleElements } from "../inaccessibleSpec";
import { GraphQLErrorExt } from "@apollo/core-schema/dist/error";
import { GraphQLError } from "graphql";

describe("removeInaccessibleElements", () => {
  const INACCESSIBLE_V02_HEADER = `
    directive @core(feature: String!, as: String, for: core__Purpose) repeatable on SCHEMA

    enum core__Purpose {
      EXECUTION
      SECURITY
    }

    directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

    schema
      @core(feature: "https://specs.apollo.dev/core/v0.2")
      @core(feature: "https://specs.apollo.dev/inaccessible/v0.2")
    {
      query: Query
    }
  `;

  function getCauses(e: unknown): GraphQLError[] {
    expect(e instanceof GraphQLErrorExt).toBeTruthy();
    const causes = errorCauses(e as Error);
    expect(causes).toBeDefined();
    expect(Array.isArray(causes)).toBeTruthy();
    for (const cause of causes!) {
      expect(cause instanceof GraphQLError).toBeTruthy();
    }
    return causes!;
  }

  function expectErrors(expectedCauseCount: number, f: () => void): string[] {
    let error: unknown = undefined;
    try {
      f();
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    const causes = getCauses(error);
    expect(causes).toHaveLength(expectedCauseCount);
    const messages = causes.map((cause) => cause.message);
    for (const message of messages) {
      expect(typeof message === "string").toBeTruthy();
    }
    messages.sort();
    return messages;
  }

  it(`succeeds for no inaccessible spec`, () => {
    const schema = buildSchema(`
      directive @core(feature: String!, as: String, for: core__Purpose) repeatable on SCHEMA

      enum core__Purpose {
        EXECUTION
        SECURITY
      }

      schema
        @core(feature: "https://specs.apollo.dev/core/v0.2")
      {
        query: Query
      }

      type Query {
        someField: String
      }
    `);

    removeInaccessibleElements(schema);
    schema.validate();
  });

  it(`doesn't affect non-core @inaccessible`, () => {
    const schema = buildSchema(`
      directive @core(feature: String!, as: String, for: core__Purpose) repeatable on SCHEMA

      enum core__Purpose {
        EXECUTION
        SECURITY
      }

      schema
        @core(feature: "https://specs.apollo.dev/core/v0.2")
      {
        query: Query
      }

      type Query {
        someField: String @inaccessible
      }

      directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION
    `);

    removeInaccessibleElements(schema);
    schema.validate();
    expect(schema.elementByCoordinate("Query.someField")).toBeDefined();
  });

  it(`fails for no @inaccessible definition`, () => {
    const schema = buildSchema(`
      directive @core(feature: String!, as: String, for: core__Purpose) repeatable on SCHEMA

      enum core__Purpose {
        EXECUTION
        SECURITY
      }

      schema
        @core(feature: "https://specs.apollo.dev/core/v0.2")
        @core(feature: "https://specs.apollo.dev/inaccessible/v0.1")
      {
        query: Query
      }

      type Query {
        someField: String
      }
    `);

    const errorMessages = expectErrors(1, () => {
      removeInaccessibleElements(schema);
    });

    expect(errorMessages).toMatchInlineSnapshot(`
      Array [
        "Invalid schema: declares https://specs.apollo.dev/inaccessible/v0.1 spec but does not define a @inaccessible directive.",
      ]
    `);
  });

  it(`fails for incompatible @inaccessible definition`, () => {
    const schema = buildSchema(`
      directive @core(feature: String!, as: String, for: core__Purpose) repeatable on SCHEMA

      enum core__Purpose {
        EXECUTION
        SECURITY
      }

      directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

      schema
        @core(feature: "https://specs.apollo.dev/core/v0.2")
        @core(feature: "https://specs.apollo.dev/inaccessible/v0.1")
      {
        query: Query
      }

      type Query {
        someField: String
      }
    `);

    const errorMessages = expectErrors(1, () => {
      removeInaccessibleElements(schema);
    });

    expect(errorMessages).toMatchInlineSnapshot(`
      Array [
        "Found invalid @inaccessible directive definition. Please ensure the directive definition in your schema's definitions matches the following:
      	directive @inaccessible on FIELD_DEFINITION | INTERFACE | OBJECT | UNION",
      ]
    `);
  });

  it(`handles renames of @inaccessible`, () => {
    const schema = buildSchema(`
      directive @core(feature: String!, as: String, for: core__Purpose) repeatable on SCHEMA

      enum core__Purpose {
        EXECUTION
        SECURITY
      }

      directive @foo on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

      schema
        @core(feature: "https://specs.apollo.dev/core/v0.2")
        @core(feature: "https://specs.apollo.dev/inaccessible/v0.2", as: "foo")
      {
        query: Query
      }

      type Query {
        someField: Bar @inaccessible
        privateField: String @foo
      }

      scalar Bar

      directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION
    `);

    removeInaccessibleElements(schema);
    schema.validate();
    expect(schema.elementByCoordinate("Query.someField")).toBeDefined();
    expect(schema.elementByCoordinate("Query.privateField")).toBeUndefined();
  });

  it(`fails for @inaccessible built-ins`, () => {
    const schema = buildSchema(`
      ${INACCESSIBLE_V02_HEADER}

      type Query {
        someField: String
      }

      # Built-in scalar
      scalar String @inaccessible

      # Built-in directive
      directive @deprecated(
        reason: String = "No longer supported" @inaccessible
      ) on FIELD_DEFINITION | ENUM_VALUE
    `);

    const errorMessages = expectErrors(2, () => {
      removeInaccessibleElements(schema);
    });

    expect(errorMessages).toMatchInlineSnapshot(`
      Array [
        "Built-in directive \\"@deprecated\\" cannot use @inaccessible.",
        "Built-in type \\"String\\" cannot use @inaccessible.",
      ]
    `);
  });

  it(`fails for @inaccessible core feature definitions`, () => {
    const schema = buildSchema(`
      directive @core(feature: String! @inaccessible, as: String, for: core__Purpose) repeatable on SCHEMA

      enum core__Purpose {
        EXECUTION @inaccessible
        SECURITY
      }

      directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

      schema
        @core(feature: "https://specs.apollo.dev/core/v0.2")
        @core(feature: "https://specs.apollo.dev/inaccessible/v0.2")
        @core(feature: "http://localhost/foo/v1.0")
      {
        query: Query
      }

      type Query {
        someField: String!
      }

      # Object type
      type foo__Object1 @inaccessible {
        foo__Field: String!
      }

      # Object field
      type foo__Object2 implements foo__Interface2 {
        foo__Field: foo__Enum1! @inaccessible
      }

      # Object field argument
      type foo__Object3 {
        someField(someArg: foo__Enum1 @inaccessible): foo__Enum2!
      }

      # Interface type
      interface foo__Interface1 @inaccessible {
        foo__Field: String!
      }

      # Interface field
      interface foo__Interface2 {
        foo__Field: foo__Enum1! @inaccessible
      }

      # Interface field argument
      interface foo__Interface3 {
        someField(someArg: foo__InputObject1 @inaccessible): foo__Enum2!
      }

      # Union type
      union foo__Union @inaccessible = foo__Object1 | foo__Object2 | foo__Object3

      # Input object type
      input foo__InputObject1 @inaccessible {
        someField: foo__Enum1
      }

      # Input object field
      input foo__InputObject2 {
        someField: foo__Scalar @inaccessible
      }

      # Enum type
      enum foo__Enum1 @inaccessible {
        someValue
      }

      # Enum value
      enum foo__Enum2 {
        someValue @inaccessible
      }

      # Scalar type
      scalar foo__Scalar @inaccessible

      # Directive argument
      directive @foo(arg: foo__InputObject2 @inaccessible) repeatable on OBJECT
    `);

    // 15 = 6 type kinds + 3 field kinds + 3 argument kinds + 1 enum value + 2 extras on special core elements
    const errorMessages = expectErrors(15, () => {
      removeInaccessibleElements(schema);
    });

    expect(errorMessages).toMatchInlineSnapshot(`
      Array [
        "Core feature directive \\"@core\\" cannot use @inaccessible.",
        "Core feature directive \\"@foo\\" cannot use @inaccessible.",
        "Core feature type \\"core__Purpose\\" cannot use @inaccessible.",
        "Core feature type \\"foo__Enum1\\" cannot use @inaccessible.",
        "Core feature type \\"foo__Enum2\\" cannot use @inaccessible.",
        "Core feature type \\"foo__InputObject1\\" cannot use @inaccessible.",
        "Core feature type \\"foo__InputObject2\\" cannot use @inaccessible.",
        "Core feature type \\"foo__Interface1\\" cannot use @inaccessible.",
        "Core feature type \\"foo__Interface2\\" cannot use @inaccessible.",
        "Core feature type \\"foo__Interface3\\" cannot use @inaccessible.",
        "Core feature type \\"foo__Object1\\" cannot use @inaccessible.",
        "Core feature type \\"foo__Object2\\" cannot use @inaccessible.",
        "Core feature type \\"foo__Object3\\" cannot use @inaccessible.",
        "Core feature type \\"foo__Scalar\\" cannot use @inaccessible.",
        "Core feature type \\"foo__Union\\" cannot use @inaccessible.",
      ]
    `);
  });

  it(`fails for @inaccessible directive definitions that aren't only executable`, () => {
    const schema = buildSchema(`
      ${INACCESSIBLE_V02_HEADER}

      type Query {
        someField: String
      }

      directive @foo(arg1: String @inaccessible) repeatable on OBJECT

      directive @bar(arg2: String, arg3: String @inaccessible) repeatable on SCHEMA | FIELD
    `);

    const errorMessages = expectErrors(2, () => {
      removeInaccessibleElements(schema);
    });

    expect(errorMessages).toMatchInlineSnapshot(`
      Array [
        "Directive \\"@bar\\" cannot use @inaccessible because it may be applied to these type-system locations: SCHEMA.",
        "Directive \\"@foo\\" cannot use @inaccessible because it may be applied to these type-system locations: OBJECT.",
      ]
    `);
  });

  it(`removes @inaccessible object types`, () => {
    const schema = buildSchema(`
      ${INACCESSIBLE_V02_HEADER}

      extend schema {
        mutation: Mutation
        subscription: Subscription
      }

      # Non-inaccessible object type
      type Query {
        someField: String
      }

      # Inaccessible mutation types should be removed
      type Mutation @inaccessible {
        someObject: Object
      }

      # Inaccessible subscription types should be removed
      type Subscription @inaccessible {
        someField: String
      }

      # Inaccessible object type
      type Object @inaccessible {
        someField: String
      }

      # Inaccessible object type referenced by inaccessible object field
      type Referencer1 implements Referencer3 {
        someField: String
        privatefield: Object! @inaccessible
      }

      # Inaccessible object type referenced by non-inaccessible object field
      # with inaccessible parent
      type Referencer2 implements Referencer4 @inaccessible {
        privateField: [Object!]!
      }

      # Inaccessible object type referenced by inaccessible interface field
      interface Referencer3 {
        someField: String
        privatefield: Object @inaccessible
      }

      # Inaccessible object type referenced by non-inaccessible interface field
      # with inaccessible parent
      interface Referencer4 @inaccessible {
        privateField: [Object]
      }

      # Inaccessible object type referenced by union member with
      # non-inaccessible siblings and parent
      union Referencer5 = Query | Object

      # Inaccessible object type referenced by union member with no siblings
      # but with inaccessible parent
      union Referencer6 @inaccessible = Object
    `);

    removeInaccessibleElements(schema);
    schema.validate();
    expect(schema.elementByCoordinate("Query")).toBeDefined();
    expect(schema.elementByCoordinate("Mutation")).toBeUndefined();
    expect(schema.elementByCoordinate("Subscription")).toBeUndefined();
    expect(schema.elementByCoordinate("Object")).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer1.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Referencer1.privatefield")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer2")).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer3.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Referencer3.privatefield")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer4")).toBeUndefined();
    const unionType = schema.elementByCoordinate("Referencer5");
    expect(unionType instanceof UnionType).toBeTruthy();
    expect((unionType as UnionType).hasTypeMember("Query")).toBeTruthy();
    expect((unionType as UnionType).hasTypeMember("Object")).toBeFalsy();
    expect(schema.elementByCoordinate("Referencer6")).toBeUndefined();
  });

  it(`fails to remove @inaccessible object types for breaking removals`, () => {
    const schema = buildSchema(`
      ${INACCESSIBLE_V02_HEADER}

      # Query types can't be inaccessible
      type Query @inaccessible {
        someField: String
      }

      # Inaccessible object type
      type Object @inaccessible {
        someField: String
      }

      # Inaccessible object type can't be referenced by object field in the API
      # schema
      type Referencer1 implements Referencer2 {
        someField: Object!
      }

      # Inaccessible object type can't be referenced by interface field in the
      # API schema
      interface Referencer2 {
        someField: Object
      }

      # Inaccessible object type can't be referenced by union member with a
      # non-inaccessible parent and no non-inaccessible siblings
      union Referencer3 = Object
    `);

    const errorMessages = expectErrors(4, () => {
      removeInaccessibleElements(schema);
    });

    expect(errorMessages).toMatchInlineSnapshot(`
      Array [
        "Type \\"Object\\" is @inaccessible but is referenced by \\"Referencer1.someField\\", which is in the API schema.",
        "Type \\"Object\\" is @inaccessible but is referenced by \\"Referencer2.someField\\", which is in the API schema.",
        "Type \\"Query\\" is @inaccessible but is the root query type, which must be in the API schema.",
        "Type \\"Referencer3\\" is in the API schema but all of its members are @inaccessible.",
      ]
    `);
  });

  it(`removes @inaccessible interface types`, () => {
    const schema = buildSchema(`
      ${INACCESSIBLE_V02_HEADER}

      type Query {
        someField: String
      }

      # Non-inaccessible interface type
      interface VisibleInterface {
        someField: String
      }

      # Inaccessible interface type
      interface Interface @inaccessible {
        someField: String
      }

      # Inaccessible interface type referenced by inaccessible object field
      type Referencer1 implements Referencer3 {
        someField: String
        privatefield: Interface! @inaccessible
      }

      # Inaccessible interface type referenced by non-inaccessible object field
      # with inaccessible parent
      type Referencer2 implements Referencer4 @inaccessible {
        privateField: [Interface!]!
      }

      # Inaccessible interface type referenced by inaccessible interface field
      interface Referencer3 {
        someField: String
        privatefield: Interface @inaccessible
      }

      # Inaccessible interface type referenced by non-inaccessible interface
      # field with inaccessible parent
      interface Referencer4 @inaccessible {
        privateField: [Interface]
      }

      # Inaccessible interface type referenced by object type implements
      type Referencer5 implements VisibleInterface & Interface {
        someField: String
      }

      # Inaccessible interface type referenced by interface type implements
      interface Referencer6 implements VisibleInterface & Interface {
        someField: String
      }
    `);

    removeInaccessibleElements(schema);
    schema.validate();
    expect(schema.elementByCoordinate("VisibleInterface")).toBeDefined();
    expect(schema.elementByCoordinate("Interface")).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer1.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Referencer1.privatefield")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer2")).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer3.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Referencer3.privatefield")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer4")).toBeUndefined();
    const objectType = schema.elementByCoordinate("Referencer5");
    expect(objectType instanceof ObjectType).toBeTruthy();
    expect(
      (objectType as ObjectType).implementsInterface("VisibleInterface")
    ).toBeTruthy();
    expect(
      (objectType as ObjectType).implementsInterface("Interface")
    ).toBeFalsy();
    const interfaceType = schema.elementByCoordinate("Referencer6");
    expect(interfaceType instanceof InterfaceType).toBeTruthy();
    expect(
      (interfaceType as InterfaceType).implementsInterface("VisibleInterface")
    ).toBeTruthy();
    expect(
      (interfaceType as InterfaceType).implementsInterface("Interface")
    ).toBeFalsy();
  });

  it(`fails to remove @inaccessible interface types for breaking removals`, () => {
    const schema = buildSchema(`
      ${INACCESSIBLE_V02_HEADER}

      type Query {
        someField: String
      }

      # Inaccessible interface type
      interface Interface @inaccessible {
        someField: String
      }

      # Inaccessible interface type can't be referenced by object field in the
      # API schema
      type Referencer1 implements Referencer2 {
        someField: [Interface!]!
      }

      # Inaccessible interface type can't be referenced by interface field in
      # the API schema
      interface Referencer2 {
        someField: [Interface]
      }
    `);

    const errorMessages = expectErrors(2, () => {
      removeInaccessibleElements(schema);
    });

    expect(errorMessages).toMatchInlineSnapshot(`
      Array [
        "Type \\"Interface\\" is @inaccessible but is referenced by \\"Referencer1.someField\\", which is in the API schema.",
        "Type \\"Interface\\" is @inaccessible but is referenced by \\"Referencer2.someField\\", which is in the API schema.",
      ]
    `);
  });

  it(`removes @inaccessible union types`, () => {
    const schema = buildSchema(`
      ${INACCESSIBLE_V02_HEADER}

      type Query {
        someField: String
      }

      # Non-inaccessible union type
      union VisibleUnion = Query

      # Inaccessible union type
      union Union @inaccessible = Query

      # Inaccessible union type referenced by inaccessible object field
      type Referencer1 implements Referencer3 {
        someField: String
        privatefield: Union! @inaccessible
      }

      # Inaccessible union type referenced by non-inaccessible object field with
      # inaccessible parent
      type Referencer2 implements Referencer4 @inaccessible {
        privateField: [Union!]!
      }

      # Inaccessible union type referenced by inaccessible interface field
      interface Referencer3 {
        someField: String
        privatefield: Union @inaccessible
      }

      # Inaccessible union type referenced by non-inaccessible interface field
      # with inaccessible parent
      interface Referencer4 @inaccessible {
        privateField: [Union]
      }
    `);

    removeInaccessibleElements(schema);
    schema.validate();
    expect(schema.elementByCoordinate("VisibleUnion")).toBeDefined();
    expect(schema.elementByCoordinate("Union")).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer1.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Referencer1.privatefield")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer2")).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer3.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Referencer3.privatefield")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer4")).toBeUndefined();
  });

  it(`fails to remove @inaccessible union types for breaking removals`, () => {
    const schema = buildSchema(`
      ${INACCESSIBLE_V02_HEADER}

      type Query {
        someField: String
      }

      # Inaccessible union type
      union Union @inaccessible = Query

      # Inaccessible union type can't be referenced by object field in the API
      # schema
      type Referencer1 implements Referencer2 {
        someField: Union!
      }

      # Inaccessible union type can't be referenced by interface field in the
      # API schema
      interface Referencer2 {
        someField: Union
      }
    `);

    const errorMessages = expectErrors(2, () => {
      removeInaccessibleElements(schema);
    });

    expect(errorMessages).toMatchInlineSnapshot(`
      Array [
        "Type \\"Union\\" is @inaccessible but is referenced by \\"Referencer1.someField\\", which is in the API schema.",
        "Type \\"Union\\" is @inaccessible but is referenced by \\"Referencer2.someField\\", which is in the API schema.",
      ]
    `);
  });

  it(`removes @inaccessible input object types`, () => {
    const schema = buildSchema(`
      ${INACCESSIBLE_V02_HEADER}

      type Query {
        someField: String
      }

      # Non-inaccessible input object type
      input VisibleInputObject {
        someField: String
      }

      # Inaccessible input object type
      input InputObject @inaccessible {
        someField: String
      }

      # Inaccessible input object type referenced by inaccessible object field
      # argument
      type Referencer1 implements Referencer4 {
        someField(privateArg: InputObject @inaccessible): String
      }

      # Inaccessible input object type referenced by non-inaccessible object
      # field argument with inaccessible parent
      type Referencer2 implements Referencer5 {
        someField: String
        privateField(privateArg: InputObject!): String @inaccessible
      }

      # Inaccessible input object type referenced by non-inaccessible object
      # field argument with inaccessible grandparent
      type Referencer3 implements Referencer6 @inaccessible {
        privateField(privateArg: InputObject!): String
      }

      # Inaccessible input object type referenced by inaccessible interface
      # field argument
      interface Referencer4 {
        someField(privateArg: InputObject @inaccessible): String
      }

      # Inaccessible input object type referenced by non-inaccessible interface
      # field argument with inaccessible parent
      interface Referencer5 {
        someField: String
        privateField(privateArg: InputObject!): String @inaccessible
      }

      # Inaccessible input object type referenced by non-inaccessible interface
      # field argument with inaccessible grandparent
      interface Referencer6 @inaccessible {
        privateField(privateArg: InputObject!): String
      }

      # Inaccessible input object type referenced by inaccessible input object
      # field
      input Referencer7 {
        someField: String
        privateField: InputObject @inaccessible
      }

      # Inaccessible input object type referenced by non-inaccessible input
      # object field with inaccessible parent
      input Referencer8 @inaccessible {
        privateField: InputObject!
      }

      # Inaccessible input object type referenced by inaccessible directive
      # argument
      directive @referencer9(privateArg: InputObject @inaccessible) on FIELD
    `);

    removeInaccessibleElements(schema);
    schema.validate();
    expect(schema.elementByCoordinate("VisibleInputObject")).toBeDefined();
    expect(schema.elementByCoordinate("InputObject")).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer1.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Referencer1.someField(privateArg:)")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer2.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Referencer2.privateField")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer3")).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer4.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Referencer4.someField(privateArg:)")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer5.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Referencer5.privateField")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer6")).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer7.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Referencer7.privatefield")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer8")).toBeUndefined();
    expect(schema.elementByCoordinate("@referencer9")).toBeDefined();
    expect(
      schema.elementByCoordinate("@referencer9(privateArg:)")
    ).toBeUndefined();
  });

  it(`fails to remove @inaccessible input object types for breaking removals`, () => {
    const schema = buildSchema(`
      ${INACCESSIBLE_V02_HEADER}

      type Query {
        someField: String
      }

      # Inaccessible input object type
      input InputObject @inaccessible {
        someField: String
      }

      # Inaccessible input object type can't be referenced by object field
      # argument in the API schema
      type Referencer1 implements Referencer2 {
        someField(someArg: InputObject): String
      }

      # Inaccessible input object type can't be referenced by interface field
      # argument in the API schema
      interface Referencer2 {
        someField(someArg: InputObject): String
      }

      # Inaccessible input object type can't be referenced by input object field
      # in the API schema
      input Referencer3 {
        someField: InputObject
      }

      # Inaccessible input object type can't be referenced by directive argument
      # in the API schema
      directive @referencer4(someArg: InputObject) on QUERY
    `);

    const errorMessages = expectErrors(4, () => {
      removeInaccessibleElements(schema);
    });

    expect(errorMessages).toMatchInlineSnapshot(`
      Array [
        "Type \\"InputObject\\" is @inaccessible but is referenced by \\"@referencer4(someArg:)\\", which is in the API schema.",
        "Type \\"InputObject\\" is @inaccessible but is referenced by \\"Referencer1.someField(someArg:)\\", which is in the API schema.",
        "Type \\"InputObject\\" is @inaccessible but is referenced by \\"Referencer2.someField(someArg:)\\", which is in the API schema.",
        "Type \\"InputObject\\" is @inaccessible but is referenced by \\"Referencer3.someField\\", which is in the API schema.",
      ]
    `);
  });

  it(`removes @inaccessible enum types`, () => {
    const schema = buildSchema(`
      ${INACCESSIBLE_V02_HEADER}

      type Query {
        someField: String
      }

      # Non-inaccessible enum type
      enum VisibleEnum {
        SOME_VALUE
      }

      # Inaccessible enum type
      enum Enum @inaccessible {
        SOME_VALUE
      }

      # Inaccessible enum type referenced by inaccessible object field
      type Referencer1 implements Referencer3 {
        someField: String
        privatefield: Enum! @inaccessible
      }

      # Inaccessible enum type referenced by non-inaccessible object field with
      # inaccessible parent
      type Referencer2 implements Referencer4 @inaccessible {
        privateField: [Enum!]!
      }

      # Inaccessible enum type referenced by inaccessible interface field
      interface Referencer3 {
        someField: String
        privatefield: Enum @inaccessible
      }

      # Inaccessible enum type referenced by non-inaccessible interface field
      # with inaccessible parent
      interface Referencer4 @inaccessible {
        privateField: [Enum]
      }

      # Inaccessible enum type referenced by inaccessible object field argument
      type Referencer5 implements Referencer8 {
        someField(privateArg: Enum @inaccessible): String
      }

      # Inaccessible enum type referenced by non-inaccessible object field
      # argument with inaccessible parent
      type Referencer6 implements Referencer9 {
        someField: String
        privateField(privateArg: Enum!): String @inaccessible
      }

      # Inaccessible enum type referenced by non-inaccessible object field
      # argument with inaccessible grandparent
      type Referencer7 implements Referencer10 @inaccessible {
        privateField(privateArg: Enum!): String
      }

      # Inaccessible enum type referenced by inaccessible interface field
      # argument
      interface Referencer8 {
        someField(privateArg: Enum @inaccessible): String
      }

      # Inaccessible enum type referenced by non-inaccessible interface field
      # argument with inaccessible parent
      interface Referencer9 {
        someField: String
        privateField(privateArg: Enum!): String @inaccessible
      }

      # Inaccessible enum type referenced by non-inaccessible interface field
      # argument with inaccessible grandparent
      interface Referencer10 @inaccessible {
        privateField(privateArg: Enum!): String
      }

      # Inaccessible enum type referenced by inaccessible input object field
      input Referencer11 {
        someField: String
        privateField: Enum @inaccessible
      }

      # Inaccessible enum type referenced by non-inaccessible input object field
      # with inaccessible parent
      input Referencer12 @inaccessible {
        privateField: Enum!
      }

      # Inaccessible enum type referenced by inaccessible directive argument
      directive @referencer13(privateArg: Enum @inaccessible) on FRAGMENT_DEFINITION
    `);

    removeInaccessibleElements(schema);
    schema.validate();
    expect(schema.elementByCoordinate("VisibleEnum")).toBeDefined();
    expect(schema.elementByCoordinate("Enum")).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer1.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Referencer1.privatefield")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer2")).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer3.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Referencer3.privatefield")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer4")).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer5.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Referencer5.someField(privateArg:)")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer6.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Referencer6.privateField")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer7")).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer8.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Referencer8.someField(privateArg:)")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer9.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Referencer9.privateField")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer10")).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer11.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Referencer11.privatefield")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer12")).toBeUndefined();
    expect(schema.elementByCoordinate("@referencer13")).toBeDefined();
    expect(
      schema.elementByCoordinate("@referencer13(privateArg:)")
    ).toBeUndefined();
  });

  it(`fails to remove @inaccessible enum types for breaking removals`, () => {
    const schema = buildSchema(`
      ${INACCESSIBLE_V02_HEADER}

      type Query {
        someField: String
      }

      # Inaccessible enum type
      enum Enum @inaccessible {
        SOME_VALUE
      }

      # Inaccessible enum type can't be referenced by object field in the API
      # schema
      type Referencer1 implements Referencer2 {
        somefield: [Enum!]!
      }

      # Inaccessible enum type can't be referenced by interface field in the API
      # schema
      interface Referencer2 {
        somefield: [Enum]
      }

      # Inaccessible enum type can't be referenced by object field argument in
      # the API schema
      type Referencer3 implements Referencer4 {
        someField(someArg: Enum): String
      }

      # Inaccessible enum type can't be referenced by interface field argument
      # in the API schema
      interface Referencer4 {
        someField(someArg: Enum): String
      }

      # Inaccessible enum type can't be referenced by input object field in the
      # API schema
      input Referencer5 {
        someField: Enum
      }

      # Inaccessible enum type can't be referenced by directive argument in the
      # API schema
      directive @referencer6(someArg: Enum) on FRAGMENT_SPREAD
    `);

    const errorMessages = expectErrors(6, () => {
      removeInaccessibleElements(schema);
    });

    expect(errorMessages).toMatchInlineSnapshot(`
      Array [
        "Type \\"Enum\\" is @inaccessible but is referenced by \\"@referencer6(someArg:)\\", which is in the API schema.",
        "Type \\"Enum\\" is @inaccessible but is referenced by \\"Referencer1.somefield\\", which is in the API schema.",
        "Type \\"Enum\\" is @inaccessible but is referenced by \\"Referencer2.somefield\\", which is in the API schema.",
        "Type \\"Enum\\" is @inaccessible but is referenced by \\"Referencer3.someField(someArg:)\\", which is in the API schema.",
        "Type \\"Enum\\" is @inaccessible but is referenced by \\"Referencer4.someField(someArg:)\\", which is in the API schema.",
        "Type \\"Enum\\" is @inaccessible but is referenced by \\"Referencer5.someField\\", which is in the API schema.",
      ]
    `);
  });

  it(`removes @inaccessible scalar types`, () => {
    const schema = buildSchema(`
      ${INACCESSIBLE_V02_HEADER}

      type Query {
        someField: String
      }

      # Non-inaccessible scalar type
      scalar VisibleScalar

      # Inaccessible scalar type
      scalar Scalar @inaccessible

      # Inaccessible scalar type referenced by inaccessible object field
      type Referencer1 implements Referencer3 {
        someField: String
        privatefield: Scalar! @inaccessible
      }

      # Inaccessible scalar type referenced by non-inaccessible object field
      # with inaccessible parent
      type Referencer2 implements Referencer4 @inaccessible {
        privateField: [Scalar!]!
      }

      # Inaccessible scalar type referenced by inaccessible interface field
      interface Referencer3 {
        someField: String
        privatefield: Scalar @inaccessible
      }

      # Inaccessible scalar type referenced by non-inaccessible interface field
      # with inaccessible parent
      interface Referencer4 @inaccessible {
        privateField: [Scalar]
      }

      # Inaccessible scalar type referenced by inaccessible object field
      # argument
      type Referencer5 implements Referencer8 {
        someField(privateArg: Scalar @inaccessible): String
      }

      # Inaccessible scalar type referenced by non-inaccessible object field
      # argument with inaccessible parent
      type Referencer6 implements Referencer9 {
        someField: String
        privateField(privateArg: Scalar!): String @inaccessible
      }

      # Inaccessible scalar type referenced by non-inaccessible object field
      # argument with inaccessible grandparent
      type Referencer7 implements Referencer10 @inaccessible {
        privateField(privateArg: Scalar!): String
      }

      # Inaccessible scalar type referenced by inaccessible interface field
      # argument
      interface Referencer8 {
        someField(privateArg: Scalar @inaccessible): String
      }

      # Inaccessible scalar type referenced by non-inaccessible interface field
      # argument with inaccessible parent
      interface Referencer9 {
        someField: String
        privateField(privateArg: Scalar!): String @inaccessible
      }

      # Inaccessible scalar type referenced by non-inaccessible interface field
      # argument with inaccessible grandparent
      interface Referencer10 @inaccessible {
        privateField(privateArg: Scalar!): String
      }

      # Inaccessible scalar type referenced by inaccessible input object field
      input Referencer11 {
        someField: String
        privateField: Scalar @inaccessible
      }

      # Inaccessible scalar type referenced by non-inaccessible input object
      # field with inaccessible parent
      input Referencer12 @inaccessible {
        privateField: Scalar!
      }

      # Inaccessible scalar type referenced by inaccessible directive argument
      directive @referencer13(privateArg: Scalar @inaccessible) on INLINE_FRAGMENT
    `);

    removeInaccessibleElements(schema);
    schema.validate();
    expect(schema.elementByCoordinate("VisibleScalar")).toBeDefined();
    expect(schema.elementByCoordinate("Scalar")).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer1.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Referencer1.privatefield")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer2")).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer3.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Referencer3.privatefield")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer4")).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer5.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Referencer5.someField(privateArg:)")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer6.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Referencer6.privateField")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer7")).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer8.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Referencer8.someField(privateArg:)")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer9.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Referencer9.privateField")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer10")).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer11.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Referencer11.privatefield")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer12")).toBeUndefined();
    expect(schema.elementByCoordinate("@referencer13")).toBeDefined();
    expect(
      schema.elementByCoordinate("@referencer13(privateArg:)")
    ).toBeUndefined();
  });

  it(`fails to remove @inaccessible scalar types for breaking removals`, () => {
    const schema = buildSchema(`
      ${INACCESSIBLE_V02_HEADER}

      type Query {
        someField: String
      }

      # Inaccessible scalar type
      scalar Scalar @inaccessible

      # Inaccessible scalar type can't be referenced by object field in the API
      # schema
      type Referencer1 implements Referencer2 {
        somefield: [[Scalar!]!]!
      }

      # Inaccessible scalar type can't be referenced by interface field in the
      # API schema
      interface Referencer2 {
        somefield: [[Scalar]]
      }

      # Inaccessible scalar type can't be referenced by object field argument in
      # the API schema
      type Referencer3 implements Referencer4 {
        someField(someArg: Scalar): String
      }

      # Inaccessible scalar type can't be referenced by interface field argument
      # in the API schema
      interface Referencer4 {
        someField(someArg: Scalar): String
      }

      # Inaccessible scalar type can't be referenced by input object field in
      # the API schema
      input Referencer5 {
        someField: Scalar
      }

      # Inaccessible scalar type can't be referenced by directive argument in
      # the API schema
      directive @referencer6(someArg: Scalar) on MUTATION
    `);

    const errorMessages = expectErrors(6, () => {
      removeInaccessibleElements(schema);
    });

    expect(errorMessages).toMatchInlineSnapshot(`
      Array [
        "Type \\"Scalar\\" is @inaccessible but is referenced by \\"@referencer6(someArg:)\\", which is in the API schema.",
        "Type \\"Scalar\\" is @inaccessible but is referenced by \\"Referencer1.somefield\\", which is in the API schema.",
        "Type \\"Scalar\\" is @inaccessible but is referenced by \\"Referencer2.somefield\\", which is in the API schema.",
        "Type \\"Scalar\\" is @inaccessible but is referenced by \\"Referencer3.someField(someArg:)\\", which is in the API schema.",
        "Type \\"Scalar\\" is @inaccessible but is referenced by \\"Referencer4.someField(someArg:)\\", which is in the API schema.",
        "Type \\"Scalar\\" is @inaccessible but is referenced by \\"Referencer5.someField\\", which is in the API schema.",
      ]
    `);
  });

  it(`removes @inaccessible object fields`, () => {
    const schema = buildSchema(`
      ${INACCESSIBLE_V02_HEADER}

      type Query {
        someField: String
        privateField: String @inaccessible
      }
    `);

    removeInaccessibleElements(schema);
    schema.validate();
    expect(schema.elementByCoordinate("Query.someField")).toBeDefined();
    expect(schema.elementByCoordinate("Query.privateField")).toBeUndefined();
  });
});
