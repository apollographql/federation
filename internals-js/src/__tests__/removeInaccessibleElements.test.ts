import {
  ArgumentDefinition,
  errorCauses,
  FieldDefinition,
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

      extend schema {
        mutation: Mutation
        subscription: Subscription
      }

      # Inaccessible object field on query type
      type Query {
        someField: String
        privateField: String @inaccessible
      }

      # Inaccessible object field on mutation type
      type Mutation {
        someField: String
        privateField: String @inaccessible
      }

      # Inaccessible object field on subscription type
      type Subscription {
        someField: String
        privateField: String @inaccessible
      }

      # Inaccessible (and non-inaccessible) object field
      type Object implements Referencer1 & Referencer2 {
        someField: String
        privateField: String @inaccessible
      }

      # Inaccessible object field referenced by inaccessible interface field
      interface Referencer1 {
        someField: String
        privateField: String @inaccessible
      }

      # Inaccessible object field referenced by non-inaccessible interface field
      # with inaccessible parent
      interface Referencer2 @inaccessible {
        privateField: String
      }

      # Inaccessible object field with an inaccessible parent and no
      # non-inaccessible siblings
      type Referencer3 @inaccessible {
        privateField: String @inaccessible
        otherPrivateField: Float @inaccessible
      }
    `);

    removeInaccessibleElements(schema);
    schema.validate();
    expect(schema.elementByCoordinate("Query.someField")).toBeDefined();
    expect(schema.elementByCoordinate("Query.privateField")).toBeUndefined();
    expect(schema.elementByCoordinate("Mutation.someField")).toBeDefined();
    expect(schema.elementByCoordinate("Mutation.privateField")).toBeUndefined();
    expect(schema.elementByCoordinate("Subscription.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Subscription.privateField")
    ).toBeUndefined();
    const objectType = schema.elementByCoordinate("Object");
    expect(objectType instanceof ObjectType).toBeTruthy();
    expect(
      (objectType as ObjectType).implementsInterface("Referencer1")
    ).toBeTruthy();
    expect(
      (objectType as ObjectType).implementsInterface("Referencer2")
    ).toBeFalsy();
    expect(schema.elementByCoordinate("Object.someField")).toBeDefined();
    expect(schema.elementByCoordinate("Object.privateField")).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer1.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Referencer1.privatefield")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer2")).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer3")).toBeUndefined();
  });

  it(`fails to remove @inaccessible object fields for breaking removals`, () => {
    const schema = buildSchema(`
      ${INACCESSIBLE_V02_HEADER}

      extend schema {
        mutation: Mutation
        subscription: Subscription
      }

      # Inaccessible object field can't have a non-inaccessible parent query
      # type and no non-inaccessible siblings
      type Query {
        privateField: String @inaccessible
        otherPrivateField: Float @inaccessible
      }

      # Inaccessible object field can't have a non-inaccessible parent mutation
      # type and no non-inaccessible siblings
      type Mutation {
        privateField: String @inaccessible
        otherPrivateField: Float @inaccessible
      }

      # Inaccessible object field can't have a non-inaccessible parent
      # subscription type and no non-inaccessible siblings
      type Subscription {
        privateField: String @inaccessible
        otherPrivateField: Float @inaccessible
      }

      # Inaccessible object field
      type Object implements Referencer1 {
        someField: String
        privateField: String @inaccessible
      }

      # Inaccessible object field can't be referenced by interface field in the
      # API schema
      interface Referencer1 {
        privateField: String
      }

      # Inaccessible object field can't have a non-inaccessible parent object
      # type and no non-inaccessible siblings
      type Referencer2 {
        privateField: String @inaccessible
        otherPrivateField: Float @inaccessible
      }
    `);

    const errorMessages = expectErrors(5, () => {
      removeInaccessibleElements(schema);
    });

    expect(errorMessages).toMatchInlineSnapshot(`
      Array [
        "Field \\"Object.privateField\\" is @inaccessible but implements the interface field \\"Referencer1.privateField\\", which is in the API schema.",
        "Type \\"Mutation\\" is in the API schema but all of its fields are @inaccessible.",
        "Type \\"Query\\" is in the API schema but all of its fields are @inaccessible.",
        "Type \\"Referencer2\\" is in the API schema but all of its fields are @inaccessible.",
        "Type \\"Subscription\\" is in the API schema but all of its fields are @inaccessible.",
      ]
    `);
  });

  it(`removes @inaccessible interface fields`, () => {
    const schema = buildSchema(`
      ${INACCESSIBLE_V02_HEADER}

      type Query {
        someField: String
      }

      # Inaccessible (and non-inaccessible) interface field
      interface Interface implements Referencer1 & Referencer2 {
        someField: String
        privateField: String @inaccessible
      }

      # Inaccessible interface field referenced by inaccessible interface field
      interface Referencer1 {
        someField: String
        privateField: String @inaccessible
      }

      # Inaccessible interface field referenced by non-inaccessible interface
      # field with inaccessible parent
      interface Referencer2 @inaccessible {
        privateField: String
      }

      # Inaccessible interface field with an inaccessible parent and no
      # non-inaccessible siblings
      interface Referencer3 @inaccessible {
        privateField: String @inaccessible
        otherPrivateField: Float @inaccessible
      }
    `);

    removeInaccessibleElements(schema);
    schema.validate();
    const interfaceType = schema.elementByCoordinate("Interface");
    expect(interfaceType instanceof InterfaceType).toBeTruthy();
    expect(
      (interfaceType as InterfaceType).implementsInterface("Referencer1")
    ).toBeTruthy();
    expect(
      (interfaceType as InterfaceType).implementsInterface("Referencer2")
    ).toBeFalsy();
    expect(schema.elementByCoordinate("Interface.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Interface.privateField")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer1.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Referencer1.privatefield")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer2")).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer3")).toBeUndefined();
  });

  it(`fails to remove @inaccessible interface fields for breaking removals`, () => {
    const schema = buildSchema(`
      ${INACCESSIBLE_V02_HEADER}

      type Query {
        someField: String
      }

      # Inaccessible interface field
      interface Interface implements Referencer1 {
        someField: String
        privateField: String @inaccessible
      }

      # Inaccessible interface field can't be referenced by interface field in
      # the API schema
      interface Referencer1 {
        privateField: String
      }

      # Inaccessible interface field can't have a non-inaccessible parent object
      # type and no non-inaccessible siblings
      interface Referencer2 {
        privateField: String @inaccessible
        otherPrivateField: Float @inaccessible
      }
    `);

    const errorMessages = expectErrors(2, () => {
      removeInaccessibleElements(schema);
    });

    expect(errorMessages).toMatchInlineSnapshot(`
      Array [
        "Field \\"Interface.privateField\\" is @inaccessible but implements the interface field \\"Referencer1.privateField\\", which is in the API schema.",
        "Type \\"Referencer2\\" is in the API schema but all of its fields are @inaccessible.",
      ]
    `);
  });

  it(`removes @inaccessible object field arguments`, () => {
    const schema = buildSchema(`
      ${INACCESSIBLE_V02_HEADER}

      # Inaccessible object field argument in query type
      type Query {
        someField(privateArg: String @inaccessible): String
      }

      # Inaccessible object field argument in mutation type
      type Mutation {
        someField(privateArg: String @inaccessible): String
      }

      # Inaccessible object field argument in subscription type
      type Subscription {
        someField(privateArg: String @inaccessible): String
      }

      # Inaccessible (and non-inaccessible) object field argument
      type Object implements Referencer1 & Referencer2 & Referencer3 {
        someField(
          someArg: String,
          privateArg: String @inaccessible
        ): String
        someOtherField: Float
      }

      # Inaccessible object field argument referenced by inaccessible interface
      # field argument
      interface Referencer1 {
        someField(
          someArg: String,
          privateArg: String @inaccessible
        ): String
      }

      # Inaccessible object field argument referenced by non-inaccessible
      # interface field argument with inaccessible parent
      interface Referencer2 {
        someField(
          someArg: String,
          privateArg: String
        ): String @inaccessible
        someOtherField: Float
      }

      # Inaccessible object field argument referenced by non-inaccessible
      # interface field argument with inaccessible grandparent
      interface Referencer3 @inaccessible {
        someField(
          someArg: String,
          privateArg: String
        ): String
      }

      # Inaccessible non-nullable object field argument with default
      type ObjectDefault {
        someField(privateArg: String! = "default" @inaccessible): String
      }
    `);

    removeInaccessibleElements(schema);
    schema.validate();
    expect(schema.elementByCoordinate("Query.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Query.someField(privateArg:)")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Mutation.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Mutation.someField(privateArg:)")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Subscription.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Subscription.someField(privateArg:)")
    ).toBeUndefined();
    const objectType = schema.elementByCoordinate("Object");
    expect(objectType instanceof ObjectType).toBeTruthy();
    expect(
      (objectType as ObjectType).implementsInterface("Referencer1")
    ).toBeTruthy();
    expect(
      (objectType as ObjectType).implementsInterface("Referencer2")
    ).toBeTruthy();
    expect(
      (objectType as ObjectType).implementsInterface("Referencer3")
    ).toBeFalsy();
    expect(
      schema.elementByCoordinate("Object.someField(someArg:)")
    ).toBeDefined();
    expect(
      schema.elementByCoordinate("Object.someField(privateArg:)")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer1.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Referencer1.someField(privateArg:)")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer2")).toBeDefined();
    expect(schema.elementByCoordinate("Referencer2.someField")).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer3")).toBeUndefined();
    expect(schema.elementByCoordinate("ObjectDefault.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("ObjectDefault.someField(privateArg:)")
    ).toBeUndefined();
  });

  it(`fails to remove @inaccessible object field arguments for breaking removals`, () => {
    const schema = buildSchema(`
      ${INACCESSIBLE_V02_HEADER}

      type Query {
        someField(someArg: String): String
      }

      # Inaccessible object field argument
      type Object implements Referencer1 {
        someField(privateArg: String @inaccessible): String
      }

      # Inaccessible object field argument can't be referenced by interface
      # field argument in the API schema
      interface Referencer1 {
        someField(privateArg: String): String
      }

      # Inaccessible object field argument can't be a required argument
      type ObjectRequired {
        someField(privateArg: String! @inaccessible): String
      }
    `);

    const errorMessages = expectErrors(2, () => {
      removeInaccessibleElements(schema);
    });

    expect(errorMessages).toMatchInlineSnapshot(`
      Array [
        "Argument \\"Object.someField(privateArg:)\\" is @inaccessible but implements the interface argument \\"Referencer1.someField(privateArg:)\\", which is in the API schema.",
        "Argument \\"ObjectRequired.someField(privateArg:)\\" is @inaccessible but is a required argument of its field.",
      ]
    `);
  });

  it(`removes @inaccessible interface field arguments`, () => {
    const schema = buildSchema(`
      ${INACCESSIBLE_V02_HEADER}

      type Query {
        someField: String
      }

      # Inaccessible (and non-inaccessible) interface field argument
      interface Interface implements Referencer1 & Referencer2 & Referencer3 {
        someField(
          someArg: String,
          privateArg: String @inaccessible
        ): String
        someOtherField: Float
      }

      # Inaccessible interface field argument referenced by inaccessible
      # interface field argument
      interface Referencer1 {
        someField(
          someArg: String,
          privateArg: String @inaccessible
        ): String
      }

      # Inaccessible interface field argument referenced by non-inaccessible
      # interface field argument with inaccessible parent
      interface Referencer2 {
        someField(
          someArg: String,
          privateArg: String
        ): String @inaccessible
        someOtherField: Float
      }

      # Inaccessible interface field argument referenced by non-inaccessible
      # interface field argument with inaccessible grandparent
      interface Referencer3 @inaccessible {
        someField(
          someArg: String,
          privateArg: String
        ): String
      }

      # Inaccessible non-nullable interface field argument with default
      interface InterfaceDefault {
        someField(privateArg: String! = "default" @inaccessible): String
      }

      # Inaccessible interface field argument referenced by non-inaccessible
      # non-required object field argument
      type Referencer4 implements InterfaceDefault {
        someField(privateArg: String! = "default"): String
      }

      # Inaccessible interface field argument referenced by non-inaccessible
      # required object field argument with inaccessible grandparent
      type Referencer5 implements InterfaceDefault @inaccessible {
        someField(privateArg: String!): String
      }

      # Inaccessible interface field argument referenced by non-inaccessible
      # non-required interface field argument
      interface Referencer6 implements InterfaceDefault {
        someField(privateArg: String! = "default"): String
      }

      # Inaccessible interface field argument referenced by non-inaccessible
      # required interface field argument with inaccessible grandparent
      interface Referencer7 implements InterfaceDefault @inaccessible {
        someField(privateArg: String!): String
      }
    `);

    removeInaccessibleElements(schema);
    schema.validate();
    const interfaceType = schema.elementByCoordinate("Interface");
    expect(interfaceType instanceof InterfaceType).toBeTruthy();
    expect(
      (interfaceType as InterfaceType).implementsInterface("Referencer1")
    ).toBeTruthy();
    expect(
      (interfaceType as InterfaceType).implementsInterface("Referencer2")
    ).toBeTruthy();
    expect(
      (interfaceType as InterfaceType).implementsInterface("Referencer3")
    ).toBeFalsy();
    expect(
      schema.elementByCoordinate("Interface.someField(someArg:)")
    ).toBeDefined();
    expect(
      schema.elementByCoordinate("Interface.someField(privateArg:)")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer1.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Referencer1.someField(privateArg:)")
    ).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer2")).toBeDefined();
    expect(schema.elementByCoordinate("Referencer2.someField")).toBeUndefined();
    expect(schema.elementByCoordinate("Referencer3")).toBeUndefined();
    expect(schema.elementByCoordinate("Interface.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("Interface.someField(privateArg:)")
    ).toBeUndefined();
    const objectArg = schema.elementByCoordinate(
      "Referencer4.someField(privateArg:)"
    );
    expect(objectArg instanceof ArgumentDefinition).toBeTruthy();
    expect(
      (
        objectArg as ArgumentDefinition<FieldDefinition<ObjectType>>
      ).isRequired()
    ).toBeFalsy();
    expect(schema.elementByCoordinate("Referencer5")).toBeUndefined();
    const interfaceArg = schema.elementByCoordinate(
      "Referencer6.someField(privateArg:)"
    );
    expect(interfaceArg instanceof ArgumentDefinition).toBeTruthy();
    expect(
      (
        interfaceArg as ArgumentDefinition<FieldDefinition<InterfaceType>>
      ).isRequired()
    ).toBeFalsy();
    expect(schema.elementByCoordinate("Referencer7")).toBeUndefined();
  });

  it(`fails to remove @inaccessible interface field arguments for breaking removals`, () => {
    const schema = buildSchema(`
      ${INACCESSIBLE_V02_HEADER}

      type Query {
        someField(someArg: String): String
      }

      # Inaccessible interface field argument
      interface Interface implements Referencer1 {
        someField(privateArg: String! = "default" @inaccessible): String
      }

      # Inaccessible interface field argument can't be referenced by interface
      # field argument in the API schema
      interface Referencer1 {
        someField(privateArg: String! = "default"): String
      }

      # Inaccessible object field argument can't be a required argument
      type InterfaceRequired {
        someField(privateArg: String! @inaccessible): String
      }

      # Inaccessible object field argument can't be implemented by a required
      # object field argument in the API schema
      type Referencer2 implements Interface & Referencer1 {
        someField(privateArg: String!): String
      }

      # Inaccessible object field argument can't be implemented by a required
      # interface field argument in the API schema
      interface Referencer3 implements Interface & Referencer1 {
        someField(privateArg: String!): String
      }
    `);

    const errorMessages = expectErrors(4, () => {
      removeInaccessibleElements(schema);
    });

    expect(errorMessages).toMatchInlineSnapshot(`
      Array [
        "Argument \\"Interface.someField(privateArg:)\\" is @inaccessible but implements the interface argument \\"Referencer1.someField(privateArg:)\\", which is in the API schema.",
        "Argument \\"Interface.someField(privateArg:)\\" is @inaccessible but is implemented by the required argument \\"Referencer2.someField(privateArg:)\\", which is in the API schema.",
        "Argument \\"Interface.someField(privateArg:)\\" is @inaccessible but is implemented by the required argument \\"Referencer3.someField(privateArg:)\\", which is in the API schema.",
        "Argument \\"InterfaceRequired.someField(privateArg:)\\" is @inaccessible but is a required argument of its field.",
      ]
    `);
  });

  it(`removes @inaccessible input object fields`, () => {
    const schema = buildSchema(`
      ${INACCESSIBLE_V02_HEADER}

      type Query {
        someField: String
      }

      # Inaccessible (and non-inaccessible) input object field
      input InputObject {
        someField: String
        privateField: String @inaccessible
      }

      # Inaccessible input object field referenced by default value of
      # inaccessible object field argument
      type Referencer1 implements Referencer4 {
        someField(
          privateArg: InputObject = { privateField: "" } @inaccessible
        ): String
      }

      # Inaccessible input object field referenced by default value of
      # non-inaccessible object field argument with inaccessible parent
      type Referencer2 implements Referencer5 {
        someField: String
        privateField(
          privateArg: InputObject! = { privateField: "" }
        ): String @inaccessible
      }

      # Inaccessible input object field referenced by default value of
      # non-inaccessible object field argument with inaccessible grandparent
      type Referencer3 implements Referencer6 @inaccessible {
        privateField(privateArg: InputObject! = { privateField: "" }): String
      }

      # Inaccessible input object field referenced by default value of
      # inaccessible interface field argument
      interface Referencer4 {
        someField(
          privateArg: InputObject = { privateField: "" } @inaccessible
        ): String
      }

      # Inaccessible input object field referenced by default value of
      # non-inaccessible interface field argument with inaccessible parent
      interface Referencer5 {
        someField: String
        privateField(
          privateArg: InputObject! = { privateField: "" }
        ): String @inaccessible
      }

      # Inaccessible input object field referenced by default value of
      # non-inaccessible interface field argument with inaccessible grandparent
      interface Referencer6 @inaccessible {
        privateField(privateArg: InputObject! = { privateField: "" }): String
      }

      # Inaccessible input object field referenced by default value of
      # inaccessible input object field
      input Referencer7 {
        someField: String
        privateField: InputObject = { privateField: "" } @inaccessible
      }

      # Inaccessible input object field referenced by default value of
      # non-inaccessible input object field with inaccessible parent
      input Referencer8 @inaccessible {
        privateField: InputObject! = { privateField: "" }
      }

      # Inaccessible input object field referenced by default value of
      # inaccessible directive argument
      directive @referencer9(
        privateArg: InputObject = { privateField: "" } @inaccessible
      ) on SUBSCRIPTION

      # Inaccessible input object field not referenced (but type is referenced)
      # by default value of object field argument in the API schema
      type Referencer10 {
        someField(privateArg: InputObject = { someField: "" }): String
      }

      # Inaccessible input object field with an inaccessible parent and no
      # non-inaccessible siblings
      input Referencer11 @inaccessible {
        privateField: String @inaccessible
        otherPrivateField: Float @inaccessible
      }

      # Inaccessible non-nullable input object field with default
      input InputObjectDefault {
        someField: String
        privateField: String! = "default" @inaccessible
      }
    `);

    removeInaccessibleElements(schema);
    schema.validate();
    expect(schema.elementByCoordinate("InputObject.someField")).toBeDefined();
    expect(
      schema.elementByCoordinate("InputObject.privateField")
    ).toBeUndefined();
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
    expect(
      schema.elementByCoordinate("Referencer10.someField(privateArg:)")
    ).toBeDefined();
    expect(schema.elementByCoordinate("Referencer11")).toBeUndefined();
    expect(
      schema.elementByCoordinate("InputObjectDefault.someField")
    ).toBeDefined();
    expect(
      schema.elementByCoordinate("InputObjectDefault.privatefield")
    ).toBeUndefined();
  });

  it(`fails to remove @inaccessible input object fields for breaking removals`, () => {
    const schema = buildSchema(`
      ${INACCESSIBLE_V02_HEADER}

      type Query {
        someField: String
      }

      # Inaccessible input object field
      input InputObject {
        someField: String
        privateField: String @inaccessible
      }

      # Inaccessible input object field can't be referenced by default value of
      # object field argument in the API schema
      type Referencer1 implements Referencer2 {
        someField(someArg: InputObject = { privateField: "" }): String
      }

      # Inaccessible input object field can't be referenced by default value of
      # interface field argument in the API schema
      interface Referencer2 {
        someField(someArg: InputObject = { privateField: "" }): String
      }

      # Inaccessible input object field can't be referenced by default value of
      # input object field in the API schema
      input Referencer3 {
        someField: InputObject = { privateField: "" }
      }

      # Inaccessible input object field can't be referenced by default value of
      # directive argument in the API schema
      directive @referencer4(
        someArg: InputObject = { privateField: "" }
      ) on FIELD

      # Inaccessible input object field can't have a non-inaccessible parent
      # and no non-inaccessible siblings
      input Referencer5 {
        privateField: String @inaccessible
        otherPrivateField: Float @inaccessible
      }

      # Inaccessible input object field can't be a required field
      input InputObjectRequired {
        someField: String
        privateField: String! @inaccessible
      }
    `);

    const errorMessages = expectErrors(6, () => {
      removeInaccessibleElements(schema);
    });

    expect(errorMessages).toMatchInlineSnapshot(`
      Array [
        "Input field \\"InputObject.privateField\\" is @inaccessible but is used in the default value of \\"@referencer4(someArg:)\\", which is in the API schema.",
        "Input field \\"InputObject.privateField\\" is @inaccessible but is used in the default value of \\"Referencer1.someField(someArg:)\\", which is in the API schema.",
        "Input field \\"InputObject.privateField\\" is @inaccessible but is used in the default value of \\"Referencer2.someField(someArg:)\\", which is in the API schema.",
        "Input field \\"InputObject.privateField\\" is @inaccessible but is used in the default value of \\"Referencer3.someField\\", which is in the API schema.",
        "Input field \\"InputObjectRequired.privateField\\" is @inaccessible but is a required input field of its type.",
        "Type \\"Referencer5\\" is in the API schema but all of its input fields are @inaccessible.",
      ]
    `);
  });

  it(`removes @inaccessible enum values`, () => {
    const schema = buildSchema(`
      ${INACCESSIBLE_V02_HEADER}

      type Query {
        someField: String
      }

      # Inaccessible (and non-inaccessible) enum value
      enum Enum {
        SOME_VALUE
        PRIVATE_VALUE @inaccessible
      }

      # Inaccessible enum value referenced by default value of inaccessible
      # object field argument
      type Referencer1 implements Referencer4 {
        someField(
          privateArg: Enum = PRIVATE_VALUE @inaccessible
        ): String
      }

      # Inaccessible enum value referenced by default value of non-inaccessible
      # object field argument with inaccessible parent
      type Referencer2 implements Referencer5 {
        someField: String
        privateField(
          privateArg: Enum! = PRIVATE_VALUE
        ): String @inaccessible
      }

      # Inaccessible enum value referenced by default value of non-inaccessible
      # object field argument with inaccessible grandparent
      type Referencer3 implements Referencer6 @inaccessible {
        privateField(privateArg: Enum! = PRIVATE_VALUE): String
      }

      # Inaccessible enum value referenced by default value of inaccessible
      # interface field argument
      interface Referencer4 {
        someField(
          privateArg: Enum = PRIVATE_VALUE @inaccessible
        ): String
      }

      # Inaccessible enum value referenced by default value of non-inaccessible
      # interface field argument with inaccessible parent
      interface Referencer5 {
        someField: String
        privateField(
          privateArg: Enum! = PRIVATE_VALUE
        ): String @inaccessible
      }

      # Inaccessible enum value referenced by default value of non-inaccessible
      # interface field argument with inaccessible grandparent
      interface Referencer6 @inaccessible {
        privateField(privateArg: Enum! = PRIVATE_VALUE): String
      }

      # Inaccessible enum value referenced by default value of inaccessible
      # input object field
      input Referencer7 {
        someField: String
        privateField: Enum = PRIVATE_VALUE @inaccessible
      }

      # Inaccessible enum value referenced by default value of non-inaccessible
      # input object field with inaccessible parent
      input Referencer8 @inaccessible {
        privateField: Enum! = PRIVATE_VALUE
      }

      # Inaccessible enum value referenced by default value of inaccessible
      # directive argument
      directive @referencer9(
        privateArg: Enum = PRIVATE_VALUE @inaccessible
      ) on FRAGMENT_SPREAD

      # Inaccessible enum value not referenced (but type is referenced) by
      # default value of object field argument in the API schema
      type Referencer10 {
        someField(privateArg: Enum = SOME_VALUE): String
      }

      # Inaccessible enum value with an inaccessible parent and no
      # non-inaccessible siblings
      enum Referencer11 @inaccessible {
        PRIVATE_VALUE @inaccessible
        OTHER_PRIVATE_VALUE @inaccessible
      }
    `);

    removeInaccessibleElements(schema);
    schema.validate();
    expect(schema.elementByCoordinate("Enum.SOME_VALUE")).toBeDefined();
    expect(schema.elementByCoordinate("Enum.PRIVATE_VALUE")).toBeUndefined();
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
    expect(
      schema.elementByCoordinate("Referencer10.someField(privateArg:)")
    ).toBeDefined();
    expect(schema.elementByCoordinate("Referencer11")).toBeUndefined();
  });

  it(`fails to remove @inaccessible enum values for breaking removals`, () => {
    const schema = buildSchema(`
      ${INACCESSIBLE_V02_HEADER}

      type Query {
        someField: String
      }

      # Inaccessible enum value
      enum Enum {
        SOME_VALUE
        PRIVATE_VALUE @inaccessible
      }

      # Inaccessible enum value can't be referenced by default value of object
      # field argument in the API schema
      type Referencer1 implements Referencer2 {
        someField(someArg: Enum = PRIVATE_VALUE): String
      }

      # Inaccessible enum value can't be referenced by default value of
      # interface field argument in the API schema
      interface Referencer2 {
        someField(someArg: Enum = PRIVATE_VALUE): String
      }

      # Inaccessible enum value can't be referenced by default value of input
      # object field in the API schema
      input Referencer3 {
        someField: Enum = PRIVATE_VALUE
      }

      # Inaccessible input enum value can't be referenced by default value of
      # directive argument in the API schema
      directive @referencer4(someArg: Enum = PRIVATE_VALUE) on INLINE_FRAGMENT

      # Inaccessible enum value can't have a non-inaccessible parent and no
      # non-inaccessible siblings
      enum Referencer5 {
        PRIVATE_VALUE @inaccessible
        OTHER_PRIVATE_VALUE @inaccessible
      }
    `);

    const errorMessages = expectErrors(5, () => {
      removeInaccessibleElements(schema);
    });

    expect(errorMessages).toMatchInlineSnapshot(`
      Array [
        "Enum value \\"Enum.PRIVATE_VALUE\\" is @inaccessible but is used in the default value of \\"@referencer4(someArg:)\\", which is in the API schema.",
        "Enum value \\"Enum.PRIVATE_VALUE\\" is @inaccessible but is used in the default value of \\"Referencer1.someField(someArg:)\\", which is in the API schema.",
        "Enum value \\"Enum.PRIVATE_VALUE\\" is @inaccessible but is used in the default value of \\"Referencer2.someField(someArg:)\\", which is in the API schema.",
        "Enum value \\"Enum.PRIVATE_VALUE\\" is @inaccessible but is used in the default value of \\"Referencer3.someField\\", which is in the API schema.",
        "Type \\"Referencer5\\" is in the API schema but all of its values are @inaccessible.",
      ]
    `);
  });

  it(`removes @inaccessible directive arguments`, () => {
    const schema = buildSchema(`
      ${INACCESSIBLE_V02_HEADER}

      type Query {
        someField: String
      }

      # Inaccessible (and non-inaccessible) directive argument
      directive @directive(
        someArg: String
        privateArg: String @inaccessible
      ) on QUERY

      # Inaccessible non-nullable directive argument with default
      directive @directiveDefault(
        someArg: String
        privateArg: String! = "default" @inaccessible
      ) on MUTATION
    `);

    removeInaccessibleElements(schema);
    schema.validate();
    expect(schema.elementByCoordinate("@directive(someArg:)")).toBeDefined();
    expect(
      schema.elementByCoordinate("@directive(privateArg:)")
    ).toBeUndefined();
    expect(
      schema.elementByCoordinate("@directiveDefault(someArg:)")
    ).toBeDefined();
    expect(
      schema.elementByCoordinate("@directiveDefault(privateArg:)")
    ).toBeUndefined();
  });

  it(`fails to remove @inaccessible directive arguments for breaking removals`, () => {
    const schema = buildSchema(`
      ${INACCESSIBLE_V02_HEADER}

      type Query {
        someField: String
      }

      # Inaccessible directive argument
      directive @directive(privateArg: String @inaccessible) on SUBSCRIPTION

      # Inaccessible directive argument can't be a required field
      directive @directiveRequired(
        someArg: String
        privateArg: String! @inaccessible
      ) on FRAGMENT_DEFINITION
    `);

    const errorMessages = expectErrors(1, () => {
      removeInaccessibleElements(schema);
    });

    expect(errorMessages).toMatchInlineSnapshot(`
      Array [
        "Argument \\"@directiveRequired(privateArg:)\\" is @inaccessible but is a required argument of its directive.",
      ]
    `);
  });

  it(`handles complex default values`, () => {
    const schema = buildSchema(`
      ${INACCESSIBLE_V02_HEADER}

      type Query {
        someField(arg1: [[RootInputObject!]]! = [
          {
            foo: {
              # 2 references (with nesting)
              privateField: [PRIVATE_VALUE]
            }
            bar: SOME_VALUE
            # 0 references since scalar
            baz: { privateField: PRIVATE_VALUE }
          },
          [{
            foo: [{
              someField: "foo"
            }]
            # 1 reference
            bar: PRIVATE_VALUE
          }]
        ]): String
      }

      input RootInputObject {
        foo: [NestedInputObject]
        bar: Enum!
        baz: Scalar! = { default: 4 }
      }

      input NestedInputObject {
        someField: String
        privateField: [Enum!] @inaccessible
      }

      enum Enum {
        SOME_VALUE
        PRIVATE_VALUE @inaccessible
      }

      scalar Scalar
    `);

    const errorMessages = expectErrors(3, () => {
      removeInaccessibleElements(schema);
    });

    expect(errorMessages).toMatchInlineSnapshot(`
      Array [
        "Enum value \\"Enum.PRIVATE_VALUE\\" is @inaccessible but is used in the default value of \\"Query.someField(arg1:)\\", which is in the API schema.",
        "Enum value \\"Enum.PRIVATE_VALUE\\" is @inaccessible but is used in the default value of \\"Query.someField(arg1:)\\", which is in the API schema.",
        "Input field \\"NestedInputObject.privateField\\" is @inaccessible but is used in the default value of \\"Query.someField(arg1:)\\", which is in the API schema.",
      ]
    `);
  });

  // It's not GraphQL-spec-compliant to allow a string for an enum value, but
  // since we're allowing it, we need to make sure this logic keeps working
  // until we're allowed to make breaking changes and remove it.
  it(`handles string enum value in default value`, () => {
    const schema = buildSchema(`
      ${INACCESSIBLE_V02_HEADER}

      type Query {
        someField(arg1: Enum! = "PRIVATE_VALUE"): String
      }

      enum Enum {
        SOME_VALUE
        PRIVATE_VALUE @inaccessible
      }
    `);

    const errorMessages = expectErrors(1, () => {
      removeInaccessibleElements(schema);
    });

    expect(errorMessages).toMatchInlineSnapshot(`
      Array [
        "Enum value \\"Enum.PRIVATE_VALUE\\" is @inaccessible but is used in the default value of \\"Query.someField(arg1:)\\", which is in the API schema.",
      ]
    `);
  });
});
