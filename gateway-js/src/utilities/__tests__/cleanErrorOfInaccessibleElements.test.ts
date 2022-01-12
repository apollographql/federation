import { execute, GraphQLError, parse } from 'graphql';
import { cleanErrorOfInaccessibleNames } from '../cleanErrorOfInaccessibleNames';
import { buildSchema } from '@apollo/federation-internals';

describe('cleanErrorOfInaccessibleNames', () => {
  const coreSchema = buildSchema(`
    directive @core(
      feature: String!,
      as: String,
      for: core__Purpose
    ) repeatable on SCHEMA

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
      bazField: Baz
    }

    interface Foo {
      someField: String
    }

    type Bar implements Foo @inaccessible {
      someField: String
    }

    type Bar2 @inaccessible {
      anotherField: String
    }

    type Baz {
      goodField: String
      inaccessibleField: String @inaccessible
    }
  `);
  const schema = coreSchema.toAPISchema().toGraphQLJSSchema();

  it('removes inaccessible type names from error messages', async () => {
    const result = await execute({
      schema,
      document: parse('{fooField{someField}}'),
      rootValue: {
        fooField: {
          __typename: 'Bar',
          someField: 'test',
        },
      },
    });

    const cleaned = cleanErrorOfInaccessibleNames(schema, result.errors![0]!);
    expect(cleaned.message).toMatchInlineSnapshot(
      `"Abstract type \\"Foo\\" was resolved to a type [inaccessible type] that does not exist inside the schema."`,
    );
  });
  it('removes multiple/repeated inaccessible type names from error messages', async () => {
    const contrivedError = new GraphQLError(
      `Something something "Bar" and "Bar" again, as well as "Bar2".`,
    );
    const cleaned = cleanErrorOfInaccessibleNames(schema, contrivedError);
    expect(cleaned.message).toMatchInlineSnapshot(
      `"Something something [inaccessible type] and [inaccessible type] again, as well as [inaccessible type]."`,
    );
  });

  it('removes inaccessible field names from error messages', async () => {
    const contrivedError = new GraphQLError(
      `Can't query inaccessible field "Baz.inaccessibleField".`,
    );
    const cleaned = cleanErrorOfInaccessibleNames(schema, contrivedError);
    expect(cleaned.message).toMatchInlineSnapshot(
      `"Can't query inaccessible field [inaccessible field]."`,
    );
  });

  it('removes multiple/repeated inaccessible field names from error messages', async () => {
    const contrivedError = new GraphQLError(
      `Can't query inaccessible field "Baz.inaccessibleField" and "Baz.inaccessibleField", as well as "Bar2.anotherField".`,
    );
    const cleaned = cleanErrorOfInaccessibleNames(schema, contrivedError);
    expect(cleaned.message).toMatchInlineSnapshot(
      `"Can't query inaccessible field [inaccessible field] and [inaccessible field], as well as [inaccessible field]."`,
    );
  });

  it("doesn't remove special-case double-quoted words from graphql error messages", () => {
    const graphqlError = new GraphQLError(
      `Something something "resolveType" something something "isTypeOf".`,
    );
    const cleaned = cleanErrorOfInaccessibleNames(schema, graphqlError);
    expect(cleaned.message).toMatchInlineSnapshot(
      `"Something something \\"resolveType\\" something something \\"isTypeOf\\"."`,
    );
  });
});
