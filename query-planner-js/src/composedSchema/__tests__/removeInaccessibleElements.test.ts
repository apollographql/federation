import { buildSchema } from 'graphql';
import { removeInaccessibleElements } from '../removeInaccessibleElements';

describe('removeInaccessibleElements', () => {
  it(`removes @inaccessible fields`, () => {
    let schema = buildSchema(`
      directive @core(feature: String!) repeatable on SCHEMA

      directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE

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

    schema = removeInaccessibleElements(schema);

    const queryType = schema.getQueryType()!;

    expect(queryType.getFields()['someField']).toBeDefined();
    expect(queryType.getFields()['privateField']).toBeUndefined();
  });

  it(`removes @inaccessible object types`, () => {
    let schema = buildSchema(`
      directive @core(feature: String!) repeatable on SCHEMA

      directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE

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
    `);

    schema = removeInaccessibleElements(schema);

    expect(schema.getType('Foo')).toBeUndefined();
  });

  it(`removes @inaccessible interface types`, () => {
    let schema = buildSchema(`
      directive @core(feature: String!) repeatable on SCHEMA

      directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE

      schema
        @core(feature: "https://specs.apollo.dev/core/v0.1")
        @core(feature: "https://specs.apollo.dev/inaccessible/v0.1")
      {
        query: Query
      }

      type Query {
        fooField: Foo
      }

      interface Foo @inaccessible {
        someField: String
      }
    `);

    schema = removeInaccessibleElements(schema);

    expect(schema.getType('Foo')).toBeUndefined();
  });
});
