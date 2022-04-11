import gql from 'graphql-tag';
import { Kind, graphql, DocumentNode, execute, type DefinitionNode } from 'graphql';
import { buildSubgraphSchema } from '../buildSubgraphSchema';
import { typeSerializer } from 'apollo-federation-integration-testsuite';
import { errorCauses } from '@apollo/federation-internals';

expect.addSnapshotSerializer(typeSerializer);

const EMPTY_DOCUMENT: DocumentNode = {
  kind: Kind.DOCUMENT,
  definitions: [] as ReadonlyArray<DefinitionNode>,
};

describe('buildSubgraphSchema', () => {
  it(`should mark a type with a key field as an entity`, () => {
    const schema = buildSubgraphSchema(gql`
      type Product @key(fields: "upc") {
        upc: String!
        name: String
        price: Int
      }
    `);

    expect(schema.getType('Product')).toMatchInlineSnapshot(`
type Product {
  upc: String!
  name: String
  price: Int
}
`);

    expect(schema.getType('_Entity')).toMatchInlineSnapshot(
      `union _Entity = Product`,
    );
  });

  it(`should mark a type with multiple key fields as an entity`, () => {
    const schema = buildSubgraphSchema(gql`
      type Product @key(fields: "upc") @key(fields: "sku") {
        upc: String!
        sku: String!
        name: String
        price: Int
      }
    `);

    expect(schema.getType('Product')).toMatchInlineSnapshot(`
type Product {
  upc: String!
  sku: String!
  name: String
  price: Int
}
`);

    expect(schema.getType('_Entity')).toMatchInlineSnapshot(
      `union _Entity = Product`,
    );
  });

  it(`should not mark a type without a key field as an entity`, () => {
    const schema = buildSubgraphSchema(gql`
      type Money {
        amount: Int!
        currencyCode: String!
      }
    `);

    expect(schema.getType('Money')).toMatchInlineSnapshot(`
type Money {
  amount: Int!
  currencyCode: String!
}
`);
  });

  it('should preserve description text in generated SDL', async () => {
    const query = `query GetServiceDetails {
      _service {
        sdl
      }
    }`;
    const schema = buildSubgraphSchema(gql`
      "Description text on 'SchemaDefinition' nodes supported as per the October 2021 Edition of the spec."
      schema {
        query: Query
      }

      "A user. This user is very complicated and requires so so so so so so so so so so so so so so so so so so so so so so so so so so so so so so so so much description text"
      type User @key(fields: "id") {
        """
        The unique ID of the user.
        """
        id: ID!
        "The user's name."
        name: String
        username: String
        foo(
          "Description 1"
          arg1: String
          "Description 2"
          arg2: String
          "Description 3 Description 3 Description 3 Description 3 Description 3 Description 3 Description 3 Description 3 Description 3 Description 3 Description 3"
          arg3: String
        ): String
      }

      extend type Query {
        _dummyField: Boolean
      }
    `);

    const { data, errors } = await graphql({ schema, source: query });
    expect(errors).toBeUndefined();
    expect((data?._service as any).sdl).toEqual(`"""
Description text on 'SchemaDefinition' nodes supported as per the October 2021 Edition of the spec.
"""
schema {
  query: Query
}

directive @key(fields: _FieldSet!, resolvable: Boolean = true) repeatable on OBJECT | INTERFACE

directive @requires(fields: _FieldSet!) on FIELD_DEFINITION

directive @provides(fields: _FieldSet!) on FIELD_DEFINITION

directive @extends on OBJECT | INTERFACE

directive @external(reason: String) on OBJECT | FIELD_DEFINITION

directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

"""
A user. This user is very complicated and requires so so so so so so so so so so so so so so so so so so so so so so so so so so so so so so so so much description text
"""
type User
  @key(fields: "id")
{
  """The unique ID of the user."""
  id: ID!

  """The user's name."""
  name: String
  username: String
  foo(
    """Description 1"""
    arg1: String

    """Description 2"""
    arg2: String

    """
    Description 3 Description 3 Description 3 Description 3 Description 3 Description 3 Description 3 Description 3 Description 3 Description 3 Description 3
    """
    arg3: String
  ): String
}

type Query {
  _entities(representations: [_Any!]!): [_Entity]!
  _service: _Service!
}

extend type Query {
  _dummyField: Boolean
}

scalar _FieldSet

scalar _Any

type _Service {
  sdl: String
}

union _Entity = User`);
  });

  describe(`should add an _entities query root field to the schema`, () => {
    it(`when a query root type with the default name has been defined`, () => {
      const schema = buildSubgraphSchema(gql`
        type Query {
          rootField: String
        }
        type Product @key(fields: "upc") {
          upc: ID!
        }
      `);

      expect(schema.getQueryType()).toMatchInlineSnapshot(`
type Query {
  rootField: String
  _entities(representations: [_Any!]!): [_Entity]!
  _service: _Service!
}
`);
    });

    it(`when a query root type with a non-default name has been defined`, () => {
      const schema = buildSubgraphSchema(gql`
        schema {
          query: QueryRoot
        }

        type QueryRoot {
          rootField: String
        }
        type Product @key(fields: "upc") {
          upc: ID!
        }
      `);

      expect(schema.getQueryType()).toMatchInlineSnapshot(`
type QueryRoot {
  rootField: String
  _entities(representations: [_Any!]!): [_Entity]!
  _service: _Service!
}
`);
    });
  });
  describe(`should not add an _entities query root field to the schema`, () => {
    it(`when no query root type has been defined`, () => {
      const schema = buildSubgraphSchema(EMPTY_DOCUMENT);

      expect(schema.getQueryType()).toMatchInlineSnapshot(`
type Query {
  _service: _Service!
}
`);
    });
    it(`when no types with keys are found`, () => {
      const schema = buildSubgraphSchema(gql`
        type Query {
          rootField: String
        }
      `);

      expect(schema.getQueryType()).toMatchInlineSnapshot(`
type Query {
  rootField: String
  _service: _Service!
}
`);
    });
    it(`when only an interface with keys are found`, () => {
      const schema = buildSubgraphSchema(gql`
        type Query {
          rootField: String
        }
        interface Product @key(fields: "upc") {
          upc: ID!
        }
      `);

      expect(schema.getQueryType()).toMatchInlineSnapshot(`
type Query {
  rootField: String
  _service: _Service!
}
`);
    });
  });
  describe('_entities root field', () => {
    it('executes resolveReference for a type if found', async () => {
      const query = `query GetEntities($representations: [_Any!]!) {
      _entities(representations: $representations) {
        ... on Product {
          name
        }
        ... on User {
          firstName
        }
      }
    }`;

      const variables = {
        representations: [
          { __typename: 'Product', upc: 1 },
          { __typename: 'User', id: 1 },
        ],
      };

      const schema = buildSubgraphSchema([
        {
          typeDefs: gql`
            type Product @key(fields: "upc") {
              upc: Int
              name: String
            }
            type User @key(fields: "id") {
              firstName: String
            }
          `,
          resolvers: {
            Product: {
              __resolveReference(object) {
                expect(object.upc).toEqual(1);
                return { name: 'Apollo Gateway' };
              },
            },
            User: {
              __resolveReference(object) {
                expect(object.id).toEqual(1);
                return Promise.resolve({ firstName: 'James' });
              },
            },
          },
        },
      ]);
      const { data, errors } = await graphql({
        schema,
        source: query,
        rootValue: null,
        contextValue: null,
        variableValues: variables,
      });
      expect(errors).toBeUndefined();
      expect((data as any)?._entities[0].name).toEqual('Apollo Gateway');
      expect((data as any)?._entities[1].firstName).toEqual('James');
    });
    it('executes resolveReference with default representation values', async () => {
      const query = `query GetEntities($representations: [_Any!]!) {
      _entities(representations: $representations) {
        ... on Product {
          upc
          name
        }
      }
    }`;

      const variables = {
        representations: [
          { __typename: 'Product', upc: 1, name: 'Apollo Gateway' },
        ],
      };

      const schema = buildSubgraphSchema(gql`
        type Product @key(fields: "upc") {
          upc: Int
          name: String
        }
      `);
      const { data, errors } = await graphql({
        schema,
        source: query,
        rootValue: null,
        contextValue: null,
        variableValues: variables,
      });
      expect(errors).toBeUndefined();
      expect((data as any)?._entities[0].name).toEqual('Apollo Gateway');
    });
  });
  describe('_service root field', () => {
    it('keeps extension types when owner type is not present', async () => {
      const query = `query GetServiceDetails {
      _service {
        sdl
      }
    }`;
      const schema = buildSubgraphSchema(gql`
        type Review {
          id: ID
        }

        extend type Review {
          title: String
        }

        extend type Product @key(fields: "upc") {
          upc: String @external
          reviews: [Review]
        }
      `);

      const { data, errors } = await graphql({ schema, source: query });
      expect(errors).toBeUndefined();
      expect((data?._service as any).sdl).toEqual(`directive @key(fields: _FieldSet!, resolvable: Boolean = true) repeatable on OBJECT | INTERFACE

directive @requires(fields: _FieldSet!) on FIELD_DEFINITION

directive @provides(fields: _FieldSet!) on FIELD_DEFINITION

directive @extends on OBJECT | INTERFACE

directive @external(reason: String) on OBJECT | FIELD_DEFINITION

directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

type Review {
  id: ID
}

extend type Review {
  title: String
}

extend type Product
  @key(fields: "upc")
{
  upc: String @external
  reviews: [Review]
}

scalar _FieldSet

scalar _Any

type _Service {
  sdl: String
}

union _Entity = Product

type Query {
  _entities(representations: [_Any!]!): [_Entity]!
  _service: _Service!
}`);
    });
    it('keeps extension interface when owner interface is not present', async () => {
      const query = `query GetServiceDetails {
    _service {
      sdl
    }
  }`;
      const schema = buildSubgraphSchema(gql`
        type Review {
          id: ID
        }

        extend type Review {
          title: String
        }

        interface Node @key(fields: "id") {
          id: ID!
        }

        extend interface Product @key(fields: "upc") {
          upc: String @external
          reviews: [Review]
        }
      `);

      const { data, errors } = await graphql({ schema, source: query });
      expect(errors).toBeUndefined();
      expect((data?._service as any).sdl).toEqual(`directive @key(fields: _FieldSet!, resolvable: Boolean = true) repeatable on OBJECT | INTERFACE

directive @requires(fields: _FieldSet!) on FIELD_DEFINITION

directive @provides(fields: _FieldSet!) on FIELD_DEFINITION

directive @extends on OBJECT | INTERFACE

directive @external(reason: String) on OBJECT | FIELD_DEFINITION

directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

type Review {
  id: ID
}

extend type Review {
  title: String
}

interface Node
  @key(fields: "id")
{
  id: ID!
}

extend interface Product
  @key(fields: "upc")
{
  upc: String @external
  reviews: [Review]
}

scalar _FieldSet

scalar _Any

type _Service {
  sdl: String
}

type Query {
  _service: _Service!
}`);
    });
    it('returns valid sdl for @key directives', async () => {
      const query = `query GetServiceDetails {
      _service {
        sdl
      }
    }`;
      const schema = buildSubgraphSchema(gql`
        type Product @key(fields: "upc") {
          upc: String!
          name: String
          price: Int
        }
      `);

      const { data, errors } = await graphql({ schema, source: query });
      expect(errors).toBeUndefined();
      expect((data?._service as any).sdl).toEqual(`directive @key(fields: _FieldSet!, resolvable: Boolean = true) repeatable on OBJECT | INTERFACE

directive @requires(fields: _FieldSet!) on FIELD_DEFINITION

directive @provides(fields: _FieldSet!) on FIELD_DEFINITION

directive @extends on OBJECT | INTERFACE

directive @external(reason: String) on OBJECT | FIELD_DEFINITION

directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

type Product
  @key(fields: "upc")
{
  upc: String!
  name: String
  price: Int
}

scalar _FieldSet

scalar _Any

type _Service {
  sdl: String
}

union _Entity = Product

type Query {
  _entities(representations: [_Any!]!): [_Entity]!
  _service: _Service!
}`);
    });
    it('returns valid sdl for multiple @key directives', async () => {
      const query = `query GetServiceDetails {
      _service {
        sdl
      }
    }`;
      const schema = buildSubgraphSchema(gql`
        type Product @key(fields: "upc") @key(fields: "name") {
          upc: String!
          name: String
          price: Int
        }
      `);

      const { data, errors } = await graphql({ schema, source: query });
      expect(errors).toBeUndefined();
      expect((data?._service as any).sdl)
        .toEqual(`directive @key(fields: _FieldSet!, resolvable: Boolean = true) repeatable on OBJECT | INTERFACE

directive @requires(fields: _FieldSet!) on FIELD_DEFINITION

directive @provides(fields: _FieldSet!) on FIELD_DEFINITION

directive @extends on OBJECT | INTERFACE

directive @external(reason: String) on OBJECT | FIELD_DEFINITION

directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

type Product
  @key(fields: "upc")
  @key(fields: "name")
{
  upc: String!
  name: String
  price: Int
}

scalar _FieldSet

scalar _Any

type _Service {
  sdl: String
}

union _Entity = Product

type Query {
  _entities(representations: [_Any!]!): [_Entity]!
  _service: _Service!
}`);
    });
    it('supports all federation directives', async () => {
      const query = `query GetServiceDetails {
        _service {
          sdl
        }
      }`;

      const schema = buildSubgraphSchema(gql`
        type Review @key(fields: "id") {
          id: ID!
          body: String
          author: User @provides(fields: "email")
          product: Product @provides(fields: "upc")
        }

        extend type User @key(fields: "email") {
          email: String @external
          reviews: [Review]
        }

        extend type Product @key(fields: "upc") {
          upc: String @external
          reviews: [Review]
        }
      `);

      const { data, errors } = await graphql({ schema, source: query });
      expect(errors).toBeUndefined();
      expect((data?._service as any).sdl).toEqual(`directive @key(fields: _FieldSet!, resolvable: Boolean = true) repeatable on OBJECT | INTERFACE

directive @requires(fields: _FieldSet!) on FIELD_DEFINITION

directive @provides(fields: _FieldSet!) on FIELD_DEFINITION

directive @extends on OBJECT | INTERFACE

directive @external(reason: String) on OBJECT | FIELD_DEFINITION

directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

type Review
  @key(fields: "id")
{
  id: ID!
  body: String
  author: User @provides(fields: "email")
  product: Product @provides(fields: "upc")
}

extend type User
  @key(fields: "email")
{
  email: String @external
  reviews: [Review]
}

extend type Product
  @key(fields: "upc")
{
  upc: String @external
  reviews: [Review]
}

scalar _FieldSet

scalar _Any

type _Service {
  sdl: String
}

union _Entity = Product | Review | User

type Query {
  _entities(representations: [_Any!]!): [_Entity]!
  _service: _Service!
}`);
    });
    it('keeps custom directives', async () => {
      const query = `query GetServiceDetails {
        _service {
          sdl
        }
      }`;

      const schema = buildSubgraphSchema(gql`
        directive @custom on FIELD

        extend type User @key(fields: "email") {
          email: String @external
        }
      `);

      const { data, errors } = await graphql({ schema, source: query });
      expect(errors).toBeUndefined();
      expect((data?._service as any).sdl).toEqual(`directive @custom on FIELD

directive @key(fields: _FieldSet!, resolvable: Boolean = true) repeatable on OBJECT | INTERFACE

directive @requires(fields: _FieldSet!) on FIELD_DEFINITION

directive @provides(fields: _FieldSet!) on FIELD_DEFINITION

directive @extends on OBJECT | INTERFACE

directive @external(reason: String) on OBJECT | FIELD_DEFINITION

directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

extend type User
  @key(fields: "email")
{
  email: String @external
}

scalar _FieldSet

scalar _Any

type _Service {
  sdl: String
}

union _Entity = User

type Query {
  _entities(representations: [_Any!]!): [_Entity]!
  _service: _Service!
}`);
    });
  });

  describe('@tag directive', () => {
    const query = `query GetServiceDetails {
      _service {
        sdl
      }
    }`;

    const validateTag = async (
      header: string,
      additionalHeader: string,
      directiveDefinitions: string,
      typeDefinitions: string,
    ) => {
      const schema = buildSubgraphSchema(gql`${header}
        type User @key(fields: "email") @tag(name: "tagOnType") {
          email: String @tag(name: "tagOnField")
        }

        interface Thing @tag(name: "tagOnInterface") {
          name: String
        }

        union UserButAUnion @tag(name: "tagOnUnion") = User
      `);

      const { data, errors } = await graphql({ schema, source: query });
      expect(errors).toBeUndefined();
      expect((data?._service as any).sdl).toEqual(`${additionalHeader}${header}${directiveDefinitions}

type User
  @key(fields: "email")
  @tag(name: "tagOnType")
{
  email: String @tag(name: "tagOnField")
}

interface Thing
  @tag(name: "tagOnInterface")
{
  name: String
}

union UserButAUnion
  @tag(name: "tagOnUnion")
 = User${typeDefinitions}`);
    };

    it.each([
      {
        name: 'fed1',
        header: '',
        additionalHeader: '',
        directiveDefinitions: `directive @key(fields: _FieldSet!, resolvable: Boolean = true) repeatable on OBJECT | INTERFACE

directive @requires(fields: _FieldSet!) on FIELD_DEFINITION

directive @provides(fields: _FieldSet!) on FIELD_DEFINITION

directive @extends on OBJECT | INTERFACE

directive @external(reason: String) on OBJECT | FIELD_DEFINITION

directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION`,
        typesDefinitions: `

scalar _FieldSet

scalar _Any

type _Service {
  sdl: String
}

union _Entity = User

type Query {
  _entities(representations: [_Any!]!): [_Entity]!
  _service: _Service!
}`,
      },
      {
        name: 'fed2',
        header: 'extend schema\n  @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag"])\n\n',
        additionalHeader: 'schema\n  @link(url: "https://specs.apollo.dev/link/v1.0")\n{\n  query: Query\n}\n\n',
        directiveDefinitions: `directive @link(url: String, as: String, for: link__Purpose, import: [link__Import]) repeatable on SCHEMA

directive @key(fields: federation__FieldSet!, resolvable: Boolean = true) repeatable on OBJECT | INTERFACE

directive @federation__requires(fields: federation__FieldSet!) on FIELD_DEFINITION

directive @federation__provides(fields: federation__FieldSet!) on FIELD_DEFINITION

directive @federation__external(reason: String) on OBJECT | FIELD_DEFINITION

directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

directive @federation__extends on OBJECT | INTERFACE

directive @federation__shareable on OBJECT | FIELD_DEFINITION

directive @federation__inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

directive @federation__override(from: String!) on FIELD_DEFINITION`,
        typesDefinitions: `

enum link__Purpose {
  """
  \`SECURITY\` features provide metadata necessary to securely resolve fields.
  """
  SECURITY

  """
  \`EXECUTION\` features provide metadata necessary for operation execution.
  """
  EXECUTION
}

scalar link__Import

scalar federation__FieldSet

scalar _Any

type _Service {
  sdl: String
}

union _Entity = User

type Query {
  _entities(representations: [_Any!]!): [_Entity]!
  _service: _Service!
}`,
      }
    ])('adds it for $name schema', async ({header, additionalHeader, directiveDefinitions, typesDefinitions}) => {
      await validateTag(header, additionalHeader, directiveDefinitions, typesDefinitions);
    });
  });

  it(`fails on bad linking`, () => {
    try {
      buildSubgraphSchema(gql`
        extend schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(url: "https://specs.apollo.dev/federation/v2.0",
            import: [ { name: "@key", as: "@primaryKey" } ])

        type Query {
          t: T
        }

        type T @key(fields: "id") {
          id: ID!
        }
        `);
    } catch (e) {
      expect(errorCauses(e)?.map((e) => e.message)).toStrictEqual([
        'Unknown directive "@key". If you meant the "@key" federation directive, you should use "@primaryKey" as it is imported under that name in the @link to the federation specification of this schema.'
      ]);
    }
  })
});

describe('legacy interface', () => {
  const resolvers = {
    Query: {
      product: () => ({}),
    },
    Product: {
      upc: () => '1234',
      price: () => 10,
    },
  };
  const typeDefs: DocumentNode[] = [
    gql`
      type Query {
        product: Product
      }
      type Product @key(fields: "upc") {
        upc: String!
        name: String
      }
    `,
    gql`
      extend type Product {
        price: Int
      }
    `,
  ];
  it('allows legacy schema module interface as an input with an array of typeDefs and resolvers', async () => {
    const schema = buildSubgraphSchema({ typeDefs, resolvers });
    expect(schema.getType('_Entity')).toMatchInlineSnapshot(
      `union _Entity = Product`,
    );
    expect(
      await execute({
        schema,
        document: gql`
          {
            product {
              price
              upc
            }
          }
        `,
      }),
    ).toEqual({
      data: {
        product: { upc: '1234', price: 10 },
      },
    });
  });
  it('allows legacy schema module interface as a single module', async () => {
    const schema = buildSubgraphSchema({
      typeDefs: gql`
        type Query {
          product: Product
        }
        type Product @key(fields: "upc") {
          upc: String!
          name: String
          price: Int
        }
      `,
      resolvers,
    });
    expect(schema.getType('_Entity')).toMatchInlineSnapshot(
      `union _Entity = Product`,
    );
    expect(
      await execute({
        schema,
        document: gql`
          {
            product {
              price
              upc
            }
          }
        `,
      }),
    ).toEqual({
      data: {
        product: { upc: '1234', price: 10 },
      },
    });
  });
  it('allows legacy schema module interface as a single module without resolvers', async () => {
    const schema = buildSubgraphSchema({
      typeDefs: gql`
        type Query {
          product: Product
        }
        type Product @key(fields: "upc") {
          upc: String!
          name: String
          price: Int
        }
      `,
    });
    expect(schema.getType('Product')).toMatchInlineSnapshot(`
type Product {
  upc: String!
  name: String
  price: Int
}
`);
    expect(schema.getType('_Entity')).toMatchInlineSnapshot(
      `union _Entity = Product`,
    );
  });
  it('allows legacy schema module interface as a simple array of documents', async () => {
    const schema = buildSubgraphSchema({ typeDefs });
    expect(schema.getType('Product')).toMatchInlineSnapshot(`
type Product {
  upc: String!
  name: String
  price: Int
}
`);
    expect(schema.getType('_Entity')).toMatchInlineSnapshot(
      `union _Entity = Product`,
    );
  });
});
