import { GraphQLResolverMap } from '../resolverMap';
import { fed2gql as gql } from '../utils/fed2gql';

export const name = 'accounts';
export const url = `https://${name}.api.com.invalid`;
export const typeDefs = gql`
  directive @stream on FIELD
  directive @transform(from: String!) on FIELD
  directive @tag(name: String!) repeatable on
    | FIELD_DEFINITION
    | INTERFACE
    | OBJECT
    | UNION
    | ARGUMENT_DEFINITION
    | SCALAR
    | ENUM
    | ENUM_VALUE
    | INPUT_OBJECT
    | INPUT_FIELD_DEFINITION

  enum CacheControlScope @tag(name: "from-reviews") {
    PUBLIC @tag(name: "from-reviews")
    PRIVATE
  }

  directive @cacheControl(
    maxAge: Int
    scope: CacheControlScope
    inheritMaxAge: Boolean
  ) on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

  scalar JSON @tag(name: "from-reviews") @specifiedBy(url: "https://json-spec.dev")

  schema {
    query: RootQuery
    mutation: Mutation
  }

  type RootQuery {
    user(id: ID!): User
    me: User @cacheControl(maxAge: 1000, scope: PRIVATE)
  }

  type PasswordAccount @key(fields: "email") {
    email: String!
  }

  type SMSAccount @key(fields: "number") {
    number: String
  }

  union AccountType @tag(name: "from-accounts") = PasswordAccount | SMSAccount

  type UserMetadata {
    name: String
    address: String
    description: String
  }

  type User @key(fields: "id") @key(fields: "username name { first last }") @tag(name: "from-accounts") {
    id: ID! @tag(name: "accounts")
    name: Name @cacheControl(inheritMaxAge: true)
    username: String @shareable # Provided by the 'reviews' subgraph
    birthDate(locale: String @tag(name: "admin")): String @tag(name: "admin") @tag(name: "dev")
    account: AccountType
    metadata: [UserMetadata]
    ssn: String
  }

  type Name {
    first: String
    last: String
  }

  type Mutation {
    login(
      username: String!
      password: String!
      userId: String @deprecated(reason: "Use username instead")
    ): User
  }

  type Library @key(fields: "id") {
    id: ID!
    name: String @external
    userAccount(id: ID! = "1"): User @requires(fields: "name")
  }
`;

const users = [
  {
    id: '1',
    name: {
      first: 'Ada',
      last: 'Lovelace',
    },
    birthDate: '1815-12-10',
    username: '@ada',
    account: { __typename: 'LibraryAccount', id: '1' },
    ssn: '123-45-6789',
  },
  {
    id: '2',
    name: {
      first: 'Alan',
      last: 'Turing',
    },
    birthDate: '1912-06-23',
    username: '@complete',
    account: { __typename: 'SMSAccount', number: '8675309' },
    ssn: '987-65-4321',
  },
];

const metadata = [
  {
    id: '1',
    metadata: [{ name: 'meta1', address: '1', description: '2' }],
  },
  {
    id: '2',
    metadata: [{ name: 'meta2', address: '3', description: '4' }],
  },
];

const libraryUsers: { [name: string]: string[] } = {
  'NYC Public Library': ['1', '2'],
};

export const resolvers: GraphQLResolverMap<any> = {
  RootQuery: {
    user(_, args) {
      return { id: args.id };
    },

    me() {
      return { id: '1' };
    },
  },
  User: {
    __resolveObject(object) {
      // Nested key example for @key(fields: "username name { first last }")
      if (object.username && object.name.first && object.name.last) {
        users.find(user => user.username === object.username);
      }

      return users.find(user => user.id === object.id);
    },
    birthDate(user, args) {
      return args.locale
        ? new Date(user.birthDate).toLocaleDateString(args.locale, {
            timeZone: 'Asia/Samarkand', // UTC + 5
          })
        : user.birthDate;
    },
    metadata(object) {
      const metaIndex = metadata.findIndex(m => m.id === object.id);
      return metadata[metaIndex].metadata.map(obj => ({ name: obj.name }));
    },
  },
  UserMetadata: {
    address(object) {
      const metaIndex = metadata.findIndex(m =>
        m.metadata.find(o => o.name === object.name),
      );
      return metadata[metaIndex].metadata[0].address;
    },
    description(object) {
      const metaIndex = metadata.findIndex(m =>
        m.metadata.find(o => o.name === object.name),
      );
      return metadata[metaIndex].metadata[0].description;
    },
  },
  Library: {
    userAccount({ name }, { id: userId }) {
      const libraryUserIds = libraryUsers[name];
      return libraryUserIds &&
        libraryUserIds.find((id: string) => id === userId)
        ? { id: userId }
        : null;
    },
  },
  Mutation: {
    login(_, args) {
      return users.find(user => user.username === args.username);
    },
  },
};
