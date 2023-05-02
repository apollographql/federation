import gql from 'graphql-tag';
import {
  Kind,
  graphql,
  DocumentNode,
  execute,
  type DefinitionNode,
  OperationTypeNode,
  GraphQLUnionType,
  printType,
} from 'graphql';
import { buildSubgraphSchema } from '../buildSubgraphSchema';
import { typeSerializer } from 'apollo-federation-integration-testsuite';
import { errorCauses } from '@apollo/federation-internals';
import './matchers';

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

    expect(printType(schema.getType('Product')!)).toMatchString(`
      type Product {
        upc: String!
        name: String
        price: Int
      }
    `);

    expect(printType(schema.getType('_Entity')!)).toMatchString(`
      union _Entity = Product
    `);
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

    expect(printType(schema.getType('Product')!)).toMatchString(`
      type Product {
        upc: String!
        sku: String!
        name: String
        price: Int
      }
    `);

    expect(printType(schema.getType('_Entity')!)).toMatchString(`
      union _Entity = Product
    `);
  });

  it(`should not mark a type without a key field as an entity`, () => {
    const schema = buildSubgraphSchema(gql`
      type Money {
        amount: Int!
        currencyCode: String!
      }
    `);

    expect(printType(schema.getType('Money')!)).toMatchString(`
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
    expect((data?._service as any).sdl).toMatchString(`
      """
      Description text on 'SchemaDefinition' nodes supported as per the October 2021 Edition of the spec.
      """
      schema {
        query: Query
      }

      directive @key(fields: _FieldSet!, resolvable: Boolean = true) repeatable on OBJECT | INTERFACE

      directive @requires(fields: _FieldSet!) on FIELD_DEFINITION

      directive @provides(fields: _FieldSet!) on FIELD_DEFINITION

      directive @external(reason: String) on OBJECT | FIELD_DEFINITION

      directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

      directive @extends on OBJECT | INTERFACE

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

      union _Entity = User
    `);
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

      expect(printType(schema.getQueryType()!)).toMatchString(`
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

      expect(printType(schema.getQueryType()!)).toMatchString(`
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

      expect(printType(schema.getQueryType()!)).toMatchString(`
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

      expect(printType(schema.getQueryType()!)).toMatchString(`
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

      expect(printType(schema.getQueryType()!)).toMatchString(`
        type Query {
          rootField: String
          _service: _Service!
        }
      `);
    });
  });

  describe('_entities root field', () => {
    it('executes resolveReference for a type if found', async () => {
      const query = `
        query GetEntities($representations: [_Any!]!) {
          _entities(representations: $representations) {
            ... on Product {
              name
            }
            ... on User {
              firstName
            }
          }
        }
      `;

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
      const query = `
        query GetEntities($representations: [_Any!]!) {
          _entities(representations: $representations) {
            ... on Product {
              upc
              name
            }
          }
        }
      `;

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

    it('correctly resolves Promise values from `resolveReference` for `resolveType`', async () => {
      const query = `#graphql
        query ($representations: [_Any!]!) {
          _entities(representations: $representations) {
            ... on Product {
              name
            }
          }
        }
      `;

      const variables = {
        representations: [{ __typename: 'Product', id: 1 }],
      };

      const schema = buildSubgraphSchema([
        {
          typeDefs: gql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.4"
                import: ["@key"]
              )
            interface Product @key(fields: "id") {
              id: ID!
              name: String
            }
            type Book implements Product @key(fields: "id") {
              id: ID!
              name: String
              author: String!
            }
          `,
          resolvers: {
            Product: {
              async __resolveReference() {
                return { id: '1', name: 'My book', author: 'Author' };
              },
              __resolveType(ref) {
                if ('author' in ref) return 'Book';
                throw new Error(
                  'Could not resolve type, received: ' + ref.toString(),
                );
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
      expect(data).toMatchInlineSnapshot(`
        Object {
          "_entities": Array [
            Object {
              "name": "My book",
            },
          ],
        }
      `);
    });
  });

  describe('_service root field', () => {
    it('keeps extension types when owner type is not present', async () => {
      const query = `
        query GetServiceDetails {
          _service {
            sdl
          }
        }
      `;

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
      expect((data?._service as any).sdl).toMatchString(`
        directive @key(fields: _FieldSet!, resolvable: Boolean = true) repeatable on OBJECT | INTERFACE

        directive @requires(fields: _FieldSet!) on FIELD_DEFINITION

        directive @provides(fields: _FieldSet!) on FIELD_DEFINITION

        directive @external(reason: String) on OBJECT | FIELD_DEFINITION

        directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

        directive @extends on OBJECT | INTERFACE

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
        }
      `);
    });

    it('keeps extension interface when owner interface is not present', async () => {
      const query = `
        query GetServiceDetails {
          _service {
            sdl
          }
        }
      `;

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
      expect((data?._service as any).sdl).toMatchString(`
        directive @key(fields: _FieldSet!, resolvable: Boolean = true) repeatable on OBJECT | INTERFACE

        directive @requires(fields: _FieldSet!) on FIELD_DEFINITION

        directive @provides(fields: _FieldSet!) on FIELD_DEFINITION

        directive @external(reason: String) on OBJECT | FIELD_DEFINITION

        directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

        directive @extends on OBJECT | INTERFACE

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
        }
      `);
    });

    it('returns valid sdl for @key directives', async () => {
      const query = `
        query GetServiceDetails {
          _service {
            sdl
          }
        }
      `;

      const schema = buildSubgraphSchema(gql`
        type Product @key(fields: "upc") {
          upc: String!
          name: String
          price: Int
        }
      `);

      const { data, errors } = await graphql({ schema, source: query });
      expect(errors).toBeUndefined();
      expect((data?._service as any).sdl).toMatchString(`
        directive @key(fields: _FieldSet!, resolvable: Boolean = true) repeatable on OBJECT | INTERFACE

        directive @requires(fields: _FieldSet!) on FIELD_DEFINITION

        directive @provides(fields: _FieldSet!) on FIELD_DEFINITION

        directive @external(reason: String) on OBJECT | FIELD_DEFINITION

        directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

        directive @extends on OBJECT | INTERFACE

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
        }
      `);
    });

    it('returns valid sdl for multiple @key directives', async () => {
      const query = `
        query GetServiceDetails {
          _service {
            sdl
          }
        }
      `;

      const schema = buildSubgraphSchema(gql`
        type Product @key(fields: "upc") @key(fields: "name") {
          upc: String!
          name: String
          price: Int
        }
      `);

      const { data, errors } = await graphql({ schema, source: query });
      expect(errors).toBeUndefined();
      expect((data?._service as any).sdl).toMatchString(`
        directive @key(fields: _FieldSet!, resolvable: Boolean = true) repeatable on OBJECT | INTERFACE

        directive @requires(fields: _FieldSet!) on FIELD_DEFINITION

        directive @provides(fields: _FieldSet!) on FIELD_DEFINITION

        directive @external(reason: String) on OBJECT | FIELD_DEFINITION

        directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

        directive @extends on OBJECT | INTERFACE

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
        }
      `);
    });

    it('supports all federation directives', async () => {
      const query = `
        query GetServiceDetails {
          _service {
            sdl
          }
        }
      `;

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
      expect((data?._service as any).sdl).toMatchString(`
        directive @key(fields: _FieldSet!, resolvable: Boolean = true) repeatable on OBJECT | INTERFACE

        directive @requires(fields: _FieldSet!) on FIELD_DEFINITION

        directive @provides(fields: _FieldSet!) on FIELD_DEFINITION

        directive @external(reason: String) on OBJECT | FIELD_DEFINITION

        directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

        directive @extends on OBJECT | INTERFACE

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
        }
      `);
    });

    it('keeps custom directives', async () => {
      const query = `
        query GetServiceDetails {
          _service {
            sdl
          }
        }
      `;

      const schema = buildSubgraphSchema(gql`
        directive @custom on FIELD

        extend type User @key(fields: "email") {
          email: String @external
        }
      `);

      const { data, errors } = await graphql({ schema, source: query });
      expect(errors).toBeUndefined();
      expect((data?._service as any).sdl).toMatchString(`
        directive @custom on FIELD

        directive @key(fields: _FieldSet!, resolvable: Boolean = true) repeatable on OBJECT | INTERFACE

        directive @requires(fields: _FieldSet!) on FIELD_DEFINITION

        directive @provides(fields: _FieldSet!) on FIELD_DEFINITION

        directive @external(reason: String) on OBJECT | FIELD_DEFINITION

        directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

        directive @extends on OBJECT | INTERFACE

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
        }
      `);
    });
  });

  describe('@tag directive', () => {
    const query = `
      query GetServiceDetails {
        _service {
          sdl
        }
      }
    `;

    const validateTag = async (
      header: string,
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
      expect((data?._service as any).sdl).toMatchString(
        (header.length === 0
          ? ''
          : `
        ${header.trim()}
        `)
        + `
        ${directiveDefinitions.trim()}

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
         = User

        ${typeDefinitions.trim()}
      `);
    };

    it.each([{
      name: 'fed1',
      header: '',
      directiveDefinitions: `
        directive @key(fields: _FieldSet!, resolvable: Boolean = true) repeatable on OBJECT | INTERFACE

        directive @requires(fields: _FieldSet!) on FIELD_DEFINITION

        directive @provides(fields: _FieldSet!) on FIELD_DEFINITION

        directive @external(reason: String) on OBJECT | FIELD_DEFINITION

        directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

        directive @extends on OBJECT | INTERFACE
      `,
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
        }
      `,
    }, {
      name: 'fed2',
      header: `
        extend schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag"])
      `,
      directiveDefinitions: `
        directive @link(url: String, as: String, for: link__Purpose, import: [link__Import]) repeatable on SCHEMA

        directive @key(fields: federation__FieldSet!, resolvable: Boolean = true) repeatable on OBJECT | INTERFACE

        directive @federation__requires(fields: federation__FieldSet!) on FIELD_DEFINITION

        directive @federation__provides(fields: federation__FieldSet!) on FIELD_DEFINITION

        directive @federation__external(reason: String) on OBJECT | FIELD_DEFINITION

        directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

        directive @federation__extends on OBJECT | INTERFACE

        directive @federation__shareable on OBJECT | FIELD_DEFINITION

        directive @federation__inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

        directive @federation__override(from: String!) on FIELD_DEFINITION
      `,
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
        }
      `,
    }])('adds it for $name schema', async ({header, directiveDefinitions, typesDefinitions}) => {
      await validateTag(header, directiveDefinitions, typesDefinitions);
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
  });

  it('do not break if the schema definition AST uses undefined for directives', () => {
    // This AST is equivalent to:
    //   schema {
    //     query: Query
    //   }
    //
    //   type Query {
    //     test: String
    //   }
    //
    // but the AST used `undefined` for fields not present, where `gql` applied
    // to the SDL abolve would use empty arrays instead. Of course, both are
    // valid and this shouldn't make a different, but this has tripped code before,
    // hence this test.
    const doc: DocumentNode = {
      kind: Kind.DOCUMENT,
      definitions: [
        {
          kind: Kind.SCHEMA_DEFINITION,
          operationTypes: [
            {
              kind: Kind.OPERATION_TYPE_DEFINITION,
              operation: OperationTypeNode.QUERY,
              type: { kind: Kind.NAMED_TYPE, name: { kind: Kind.NAME, value: 'Query' } }
            },
          ]
        },
        {
          kind: Kind.OBJECT_TYPE_DEFINITION,
          name: { kind: Kind.NAME, value: 'Query' },
          fields: [
            {
              kind: Kind.FIELD_DEFINITION,
              name: { kind: Kind.NAME, value: 'test' },
              type: {
                kind: Kind.NAMED_TYPE,
                name: { kind: Kind.NAME, value: 'String' }
              },
            },
          ]
        },
      ],
    };


    expect(() => buildSubgraphSchema(doc)).not.toThrow();
  });

  it('correctly attaches the provided subscribe function to the schema object', () => {
    async function* subscribeFn () {
      for await (const word of ['Hello', 'Bonjour', 'Ciao']) {
        yield word;
      }
    }
    const schema = buildSubgraphSchema([
      {
        typeDefs: gql`
          type Query {
            hello: String!
          }

          type Subscription {
            hello: String!
          }
        `,
        resolvers: {
          Subscription: {
            hello: {
              subscribe: subscribeFn,
            },
          },
        },
      },
    ]);

    expect(schema.getSubscriptionType()?.getFields()['hello'].subscribe).toBe(
      subscribeFn,
    );
  });

  // Those tests ensures that we expand older federation specification to their proper definitions,
  // so they explicitely link to older spec and should not be changed.
  describe('federation specification backward compatibility', () => {
    const testVersion = async (version: string, expectedOutput: string) => {
      const query = `
        query {
          _service {
            sdl
          }
        }
      `;

      const schema = buildSubgraphSchema(gql`
        extend schema
          @link(url: "https://specs.apollo.dev/federation/v${version}", import: ["@key"])

        type Query {
          x: Int
        }
      `)

      const { data, errors } = await graphql({ schema, source: query });
      expect(errors).toBeUndefined();
      expect((data?._service as any).sdl).toMatchString(expectedOutput);
    }

    it('expands federation 2.0 correctly', async () => {
      // For 2.0, we expect in particular that:
      // - the @composeDirective directive is *not* present
      // - the @shareable directive is *not* repeatable
      await testVersion('2.0', `
        schema
          @link(url: \"https://specs.apollo.dev/link/v1.0\")
        {
          query: Query
        }

        extend schema
          @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])

        directive @link(url: String, as: String, for: link__Purpose, import: [link__Import]) repeatable on SCHEMA

        directive @key(fields: federation__FieldSet!, resolvable: Boolean = true) repeatable on OBJECT | INTERFACE

        directive @federation__requires(fields: federation__FieldSet!) on FIELD_DEFINITION

        directive @federation__provides(fields: federation__FieldSet!) on FIELD_DEFINITION

        directive @federation__external(reason: String) on OBJECT | FIELD_DEFINITION

        directive @federation__tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

        directive @federation__extends on OBJECT | INTERFACE

        directive @federation__shareable on OBJECT | FIELD_DEFINITION

        directive @federation__inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

        directive @federation__override(from: String!) on FIELD_DEFINITION

        type Query {
          x: Int
          _service: _Service!
        }

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
      `);
    });

    it('expands federation 2.1 correctly', async () => {
      // For 2.1, we expect in particular that:
      // - the @composeDirective directive to exists
      // - the @shareable directive is *not* repeatable
      await testVersion('2.1', `
        schema
          @link(url: \"https://specs.apollo.dev/link/v1.0\")
        {
          query: Query
        }

        extend schema
          @link(url: "https://specs.apollo.dev/federation/v2.1", import: ["@key"])

        directive @link(url: String, as: String, for: link__Purpose, import: [link__Import]) repeatable on SCHEMA

        directive @key(fields: federation__FieldSet!, resolvable: Boolean = true) repeatable on OBJECT | INTERFACE

        directive @federation__requires(fields: federation__FieldSet!) on FIELD_DEFINITION

        directive @federation__provides(fields: federation__FieldSet!) on FIELD_DEFINITION

        directive @federation__external(reason: String) on OBJECT | FIELD_DEFINITION

        directive @federation__tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

        directive @federation__extends on OBJECT | INTERFACE

        directive @federation__shareable on OBJECT | FIELD_DEFINITION

        directive @federation__inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

        directive @federation__override(from: String!) on FIELD_DEFINITION

        directive @federation__composeDirective(name: String) repeatable on SCHEMA

        type Query {
          x: Int
          _service: _Service!
        }

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
      `);
    });

    it('expands federation 2.2 correctly', async () => {
      // For 2.2, we expect everything from 2.1 plus:
      // - the @shareable directive to be repeatable
      await testVersion('2.2', `
        schema
          @link(url: \"https://specs.apollo.dev/link/v1.0\")
        {
          query: Query
        }

        extend schema
          @link(url: "https://specs.apollo.dev/federation/v2.2", import: ["@key"])

        directive @link(url: String, as: String, for: link__Purpose, import: [link__Import]) repeatable on SCHEMA

        directive @key(fields: federation__FieldSet!, resolvable: Boolean = true) repeatable on OBJECT | INTERFACE

        directive @federation__requires(fields: federation__FieldSet!) on FIELD_DEFINITION

        directive @federation__provides(fields: federation__FieldSet!) on FIELD_DEFINITION

        directive @federation__external(reason: String) on OBJECT | FIELD_DEFINITION

        directive @federation__tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

        directive @federation__extends on OBJECT | INTERFACE

        directive @federation__shareable repeatable on OBJECT | FIELD_DEFINITION

        directive @federation__inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

        directive @federation__override(from: String!) on FIELD_DEFINITION

        directive @federation__composeDirective(name: String) repeatable on SCHEMA

        type Query {
          x: Int
          _service: _Service!
        }

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
      `);
    });

    it('expands federation 2.3 correctly', async () => {
      // For 2.3, we expect in everything from 2.2 plus:
      // - the @interfaceObject directive
      // - the @tag directive to additionally have the SCHEMA location
      await testVersion('2.3', `
        schema
          @link(url: \"https://specs.apollo.dev/link/v1.0\")
        {
          query: Query
        }

        extend schema
          @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key"])

        directive @link(url: String, as: String, for: link__Purpose, import: [link__Import]) repeatable on SCHEMA

        directive @key(fields: federation__FieldSet!, resolvable: Boolean = true) repeatable on OBJECT | INTERFACE

        directive @federation__requires(fields: federation__FieldSet!) on FIELD_DEFINITION

        directive @federation__provides(fields: federation__FieldSet!) on FIELD_DEFINITION

        directive @federation__external(reason: String) on OBJECT | FIELD_DEFINITION

        directive @federation__tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION | SCHEMA

        directive @federation__extends on OBJECT | INTERFACE

        directive @federation__shareable repeatable on OBJECT | FIELD_DEFINITION

        directive @federation__inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

        directive @federation__override(from: String!) on FIELD_DEFINITION

        directive @federation__composeDirective(name: String) repeatable on SCHEMA

        directive @federation__interfaceObject on OBJECT

        type Query {
          x: Int
          _service: _Service!
        }

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
      `);
    });
  });
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
    expect(printType(schema.getType('_Entity')!)).toMatchString(`
      union _Entity = Product
    `);

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
    expect(printType(schema.getType('_Entity')!)).toMatchString(`
      union _Entity = Product
    `);

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
    expect(printType(schema.getType('Product')!)).toMatchString(`
      type Product {
        upc: String!
        name: String
        price: Int
      }
    `);

    expect(printType(schema.getType('_Entity')!)).toMatchString(`
      union _Entity = Product
    `);
  });

  it('defines the `resolveType` resolver on the `_Entity` union', async () => {
    const schema = buildSubgraphSchema({ typeDefs });

    expect(
      (schema.getType('_Entity') as GraphQLUnionType).resolveType,
    ).toBeDefined();
  });

  it('allows legacy schema module interface as a simple array of documents', async () => {
    const schema = buildSubgraphSchema({ typeDefs });
    expect(printType(schema.getType('Product')!)).toMatchString(`
      type Product {
        upc: String!
        name: String
        price: Int
      }
    `);

    expect(printType(schema.getType('_Entity')!)).toMatchString(`
      union _Entity = Product
    `);
  });
});
