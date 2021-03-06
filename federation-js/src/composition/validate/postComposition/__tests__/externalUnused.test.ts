import gql from 'graphql-tag';
import { composeServices } from '../../../compose';
import { externalUnused as validateExternalUnused } from '../';
import { graphqlErrorSerializer } from 'apollo-federation-integration-testsuite';

expect.addSnapshotSerializer(graphqlErrorSerializer);

describe('externalUnused', () => {
  it('warns when there is an unused @external field', () => {
    const serviceA = {
      typeDefs: gql`
        type Product @key(fields: "id") {
          sku: String!
          upc: String!
          id: ID!
        }
      `,
      name: 'serviceA',
    };

    const serviceB = {
      typeDefs: gql`
        extend type Product {
          sku: String! @external
          id: ID! @external
          price: Int! @requires(fields: "id")
        }
      `,
      name: 'serviceB',
    };

    const serviceList = [serviceA, serviceB];
    const { schema } = composeServices(serviceList);
    const warnings = validateExternalUnused({ schema, serviceList });
    expect(warnings).toMatchInlineSnapshot(`
      Array [
        Object {
          "code": "EXTERNAL_UNUSED",
          "message": "[serviceB] Product.sku -> is marked as @external but is not used by a @requires, @key, or @provides directive.",
        },
      ]
    `);
  });

  it('does not warn when @external is selected by a @key', () => {
    const serviceA = {
      typeDefs: gql`
        type Product @key(fields: "sku") {
          sku: String!
        }
      `,
      name: 'serviceA',
    };

    const serviceB = {
      typeDefs: gql`
        extend type Product @key(fields: "sku") {
          sku: String! @external
          price: Float!
        }
      `,
      name: 'serviceB',
    };

    const serviceList = [serviceA, serviceB];
    const { schema } = composeServices(serviceList);
    const warnings = validateExternalUnused({ schema, serviceList });
    expect(warnings).toEqual([]);
  });

  it('does not warn when @external is selected by a @requires', () => {
    const serviceA = {
      typeDefs: gql`
        type Product @key(fields: "sku") {
          sku: String!
        }
      `,
      name: 'serviceA',
    };

    const serviceB = {
      typeDefs: gql`
        extend type Product {
          sku: String! @external
          price: Int! @requires(fields: "sku")
        }
      `,
      name: 'serviceB',
    };

    const serviceList = [serviceA, serviceB];
    const { schema } = composeServices(serviceList);
    const warnings = validateExternalUnused({ schema, serviceList });
    expect(warnings).toEqual([]);
  });

  it('does not warn when @external is selected by a @provides', () => {
    const serviceA = {
      typeDefs: gql`
        type Product @key(fields: "sku") {
          sku: String!
          id: String!
        }
      `,
      name: 'serviceA',
    };

    const serviceB = {
      typeDefs: gql`
        extend type Product @key(fields: "sku") {
          sku: String! @external
          price: Int! @provides(fields: "id")
        }
      `,
      name: 'serviceB',
    };

    const serviceList = [serviceA, serviceB];
    const { schema } = composeServices(serviceList);
    const warnings = validateExternalUnused({ schema, serviceList });
    expect(warnings).toEqual([]);
  });

  it('does not warn when @external is selected by a @provides used from another type', () => {
    const serviceA = {
      typeDefs: gql`
        type User @key(fields: "id") {
          id: ID!
          username: String
        }
      `,
      name: 'serviceA',
    };

    const serviceB = {
      typeDefs: gql`
        type Review {
          author: User @provides(fields: "username")
        }

        extend type User @key(fields: "id") {
          username: String @external
        }
      `,
      name: 'serviceB',
    };

    const serviceList = [serviceA, serviceB];
    const { schema } = composeServices(serviceList);
    const warnings = validateExternalUnused({ schema, serviceList });
    expect(warnings).toEqual([]);
  });

  it.todo(
    'does not error when @provides selects an external field in a subselection',
  );

  it.todo('errors when there is an invalid selection in @requires');

  it('does not warn when @external is selected by a @requires used from another type', () => {
    const serviceA = {
      typeDefs: gql`
        type User @key(fields: "id") {
          id: ID!
          username: String
        }

        type AccountRoles {
          canRead: Boolean
          canWrite: Boolean
        }
      `,
      name: 'serviceA',
    };

    const serviceB = {
      typeDefs: gql`
        type Review {
          author: User
        }

        extend type User @key(fields: "id") {
          roles: AccountRoles!
          isAdmin: Boolean! @requires(fields: "roles { canWrite }")
        }

        # Externals -- only referenced by the @requires on User.isAdmin
        extend type AccountRoles {
          canWrite: Boolean @external
        }
      `,
      name: 'serviceB',
    };

    const serviceList = [serviceA, serviceB];
    const { schema } = composeServices(serviceList);
    const warnings = validateExternalUnused({ schema, serviceList });
    expect(warnings).toEqual([]);
  });

  it('does not warn when @external is selected by a @requires in a deep subselection', () => {
    const serviceA = {
      typeDefs: gql`
        type User @key(fields: "id") {
          id: ID!
          username: String
        }

        type AccountRoles {
          canRead: Group
          canWrite: Group
        }

        type Group {
          id: ID!
          name: String
          members: [User]
        }
      `,
      name: 'serviceA',
    };

    const serviceB = {
      typeDefs: gql`
        type Review {
          author: User
        }

        extend type User @key(fields: "id") {
          id: ID! @external
          roles: AccountRoles!
          username: String @external
          isAdmin: Boolean!
            @requires(
              fields: """
              roles {
                canWrite {
                  members {
                    username
                  }
                }
                canRead {
                  members {
                    username
                  }
                }
              }
              """
            )
        }

        # Externals -- only referenced by the @requires on User.isAdmin
        extend type AccountRoles {
          canWrite: Group @external
          canRead: Group @external
        }

        extend type Group {
          members: [User] @external
        }
      `,
      name: 'serviceB',
    };

    const serviceList = [serviceA, serviceB];
    const { schema } = composeServices(serviceList);
    const warnings = validateExternalUnused({ schema, serviceList });
    expect(warnings).toEqual([]);
  });

  it('does not warn when @external is used on type with multiple @key directives', () => {
    const serviceA = {
      typeDefs: gql`
        type Product @key(fields: "upc") @key(fields: "sku") {
          upc: String
          sku: String
        }
      `,
      name: 'serviceA',
    };

    const serviceB = {
      typeDefs: gql`
        extend type Product @key(fields: "upc") {
          upc: String @external
        }
      `,
      name: 'serviceB',
    };

    const serviceC = {
      typeDefs: gql`
        extend type Product @key(fields: "sku") {
          sku: String @external
        }
      `,
      name: 'serviceC',
    };

    const serviceList = [serviceA, serviceB, serviceC];
    const { schema } = composeServices(serviceList);
    const warnings = validateExternalUnused({ schema, serviceList });
    expect(warnings).toEqual([]);
  });

  it('does not error when @external is used on a field of a concrete type that implements a shared field of an implemented interface', () => {
    const serviceA = {
      typeDefs: gql`
        type Car implements Vehicle @key(fields: "id") {
          id: ID!
          speed: Int
        }
        interface Vehicle {
          id: ID!
          speed: Int
        }
      `,
      name: 'serviceA',
    };
    const serviceB = {
      typeDefs: gql`
        extend type Car implements Vehicle @key(fields: "id") {
          id: ID! @external
          speed: Int @external
        }
        interface Vehicle {
          id: ID!
          speed: Int
        }
      `,
      name: 'serviceB',
    };
    const serviceList = [serviceA, serviceB];
    const { schema } = composeServices(serviceList);
    const errors = validateExternalUnused({ schema, serviceList });
    expect(errors).toHaveLength(0);
  });

  it('does error when @external is used on a field of a concrete type is not shared by its implemented interface', () => {
    const serviceA = {
      typeDefs: gql`
        type Car implements Vehicle @key(fields: "id") {
          id: ID!
          speed: Int
          wheelSize: Int
        }
        interface Vehicle {
          id: ID!
          speed: Int
        }
      `,
      name: 'serviceA',
    };
    const serviceB = {
      typeDefs: gql`
        extend type Car implements Vehicle @key(fields: "id") {
          id: ID! @external
          speed: Int @external
          wheelSize: Int @external
        }
        interface Vehicle {
          id: ID!
          speed: Int
        }
      `,
      name: 'serviceB',
    };
    const serviceList = [serviceA, serviceB];
    const { schema } = composeServices(serviceList);
    const errors = validateExternalUnused({ schema, serviceList });
    expect(errors).toMatchInlineSnapshot(`
      Array [
        Object {
          "code": "EXTERNAL_UNUSED",
          "message": "[serviceB] Car.wheelSize -> is marked as @external but is not used by a @requires, @key, or @provides directive.",
        },
      ]
    `);
  });
});
