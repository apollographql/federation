import { buildSchema, assertValidSchema, GraphQLObjectType } from 'graphql';
import { removeInaccessibleElements } from '../removeInaccessibleElements';

describe('removeInaccessibleElements', () => {
  it(`removes @inaccessible fields`, () => {
    let schema = buildSchema(`
      directive @core(feature: String!) repeatable on SCHEMA

      directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

      schema
        @core(feature: "https://specs.apollo.dev/core/v0.1")
        @core(feature: "https://specs.apollo.dev/inaccessible/v0.1")
      {
        query: Query
      }

      type Query {
        someField: String
        privateField: String @inaccessible
      }
    `);

    schema = removeInaccessibleElements(schema).schema;

    const queryType = schema.getQueryType()!;

    expect(queryType.getFields()['someField']).toBeDefined();
    expect(queryType.getFields()['privateField']).toBeUndefined();
  });

  it(`removes @inaccessible object types`, () => {
    let schema = buildSchema(`
      directive @core(feature: String!) repeatable on SCHEMA

      directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

      schema
        @core(feature: "https://specs.apollo.dev/core/v0.1")
        @core(feature: "https://specs.apollo.dev/inaccessible/v0.1")
      {
        query: Query
      }

      type Query {
        fooField: Foo @inaccessible
      }

      type Foo @inaccessible {
        someField: String
      }

      union Bar = Foo
    `);

    let removedTypes;
    ({ schema, removedTypes } = removeInaccessibleElements(schema));
    const removedType = Array.from([...removedTypes!])[0];

    expect(schema.getType('Foo')).toBeUndefined();
    expect(removedType.name).toEqual('Foo');
  });

  it(`removes @inaccessible interface types`, () => {
    let schema = buildSchema(`
      directive @core(feature: String!) repeatable on SCHEMA

      directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

      schema
        @core(feature: "https://specs.apollo.dev/core/v0.1")
        @core(feature: "https://specs.apollo.dev/inaccessible/v0.1")
      {
        query: Query
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

    let removedTypes;
    ({ schema, removedTypes } = removeInaccessibleElements(schema));
    const removedType = Array.from([...removedTypes!])[0];

    expect(schema.getType('Foo')).toBeUndefined();
    const barType = schema.getType('Bar') as GraphQLObjectType | undefined;
    expect(barType).toBeDefined();
    expect(barType?.getFields()['someField']).toBeDefined();
    expect(barType?.getInterfaces()).toHaveLength(0);
    expect(removedType.name).toEqual('Foo');
  });

  it(`removes @inaccessible union types`, () => {
    let schema = buildSchema(`
      directive @core(feature: String!) repeatable on SCHEMA

      directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

      schema
        @core(feature: "https://specs.apollo.dev/core/v0.1")
        @core(feature: "https://specs.apollo.dev/inaccessible/v0.1")
      {
        query: Query
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

    let removedTypes;
    ({ schema, removedTypes } = removeInaccessibleElements(schema));
    const removedType = Array.from([...removedTypes!])[0];

    expect(schema.getType('Foo')).toBeUndefined();
    expect(schema.getType('Bar')).toBeDefined();
    expect(schema.getType('Baz')).toBeDefined();
    expect(removedType.name).toEqual('Foo');
  });

  it(`throws when a field returning an @inaccessible type isn't marked @inaccessible itself`, () => {
    let schema = buildSchema(`
      directive @core(feature: String!) repeatable on SCHEMA

      directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

      schema
        @core(feature: "https://specs.apollo.dev/core/v0.1")
        @core(feature: "https://specs.apollo.dev/inaccessible/v0.1")
      {
        query: Query
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
      `Field Query.fooField returns an @inaccessible type without being marked @inaccessible itself`,
    );
  });

  it(`removes @inaccessible query root type`, () => {
    let schema = buildSchema(`
      directive @core(feature: String!) repeatable on SCHEMA

      directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

      schema
        @core(feature: "https://specs.apollo.dev/core/v0.1")
        @core(feature: "https://specs.apollo.dev/inaccessible/v0.1")
      {
        query: Query
      }

      type Query @inaccessible {
        fooField: Foo
      }

      type Foo {
        someField: String
      }
    `);

    schema = removeInaccessibleElements(schema).schema;

    expect(schema.getQueryType()).toBeUndefined();
    expect(schema.getType('Query')).toBeUndefined();

    expect(() => assertValidSchema(schema)).toThrow();
  });

  it(`removes @inaccessible mutation root type`, () => {
    let schema = buildSchema(`
      directive @core(feature: String!) repeatable on SCHEMA

      directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

      schema
        @core(feature: "https://specs.apollo.dev/core/v0.1")
        @core(feature: "https://specs.apollo.dev/inaccessible/v0.1")
      {
        query: Query
        mutation: Mutation
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

    schema = removeInaccessibleElements(schema).schema;

    expect(schema.getMutationType()).toBeUndefined();
    expect(schema.getType('Mutation')).toBeUndefined();
  });

  it(`removes @inaccessible subscription root type`, () => {
    let schema = buildSchema(`
      directive @core(feature: String!) repeatable on SCHEMA

      directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

      schema
        @core(feature: "https://specs.apollo.dev/core/v0.1")
        @core(feature: "https://specs.apollo.dev/inaccessible/v0.1")
      {
        query: Query
        subscription: Subscription
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

    schema = removeInaccessibleElements(schema).schema;

    expect(schema.getSubscriptionType()).toBeUndefined();
    expect(schema.getType('Subscription')).toBeUndefined();
  });
});
