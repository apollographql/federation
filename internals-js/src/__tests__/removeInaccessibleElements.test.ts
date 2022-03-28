import { ObjectType } from '../definitions';
import { buildSchema } from '../buildSchema';
import { removeInaccessibleElements } from '../inaccessibleSpec';

describe('removeInaccessibleElements', () => {
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

    const queryType = schema.schemaDefinition.rootType('query')!;

    expect(queryType.field('someField')).toBeDefined();
    expect(queryType.field('privateField')).toBeUndefined();
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
      }

      type Foo @inaccessible {
        someField: String
      }

      union Bar = Foo
    `);

    removeInaccessibleElements(schema);

    expect(schema.type('Foo')).toBeUndefined();
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
      }

      interface Foo @inaccessible {
        someField: String
      }

      type Bar implements Foo {
        someField: String
      }
    `);

    removeInaccessibleElements(schema);

    expect(schema.type('Foo')).toBeUndefined();
    const barType = schema.type('Bar') as ObjectType | undefined;
    expect(barType).toBeDefined();
    expect(barType?.field('someField')).toBeDefined();
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

    expect(schema.type('Foo')).toBeUndefined();
    expect(schema.type('Bar')).toBeDefined();
    expect(schema.type('Baz')).toBeDefined();
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
      }

      type Foo @inaccessible {
        someField: String
      }

      union Bar = Foo
    `);

    expect(() => {
      removeInaccessibleElements(schema);
    }).toThrow(
      `Field "Query.fooField" returns @inaccessible type "Foo" without being marked @inaccessible itself`,
    );
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

    removeInaccessibleElements(schema);

    expect(schema.schemaDefinition.rootType('query')).toBeUndefined();
    expect(schema.type('Query')).toBeUndefined();

    expect(() => schema.validate()).toThrow();
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

    expect(schema.schemaDefinition.rootType('mutation')).toBeUndefined();
    expect(schema.type('Mutation')).toBeUndefined();
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

    expect(schema.schemaDefinition.rootType('subscription')).toBeUndefined();
    expect(schema.type('Subscription')).toBeUndefined();
  });
});
