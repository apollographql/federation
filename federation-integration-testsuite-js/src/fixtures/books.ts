import { GraphQLResolverMap } from '../resolverMap';
import { fed2gql as gql } from '../utils/fed2gql';

export const name = 'books';
export const url = `https://${name}.api.com.invalid`;
export const typeDefs = gql`
  directive @stream on FIELD
  directive @transform(from: String!) on FIELD

  enum CacheControlScope {
    PUBLIC
    PRIVATE
  }

  directive @cacheControl(
    maxAge: Int
    scope: CacheControlScope
    inheritMaxAge: Boolean
  ) on FIELD_DEFINITION | OBJECT | INTERFACE | UNION


  type Query {
    book(isbn: String!): Book
    books: [Book]
    library(id: ID!): Library
  }

  type Library @key(fields: "id") {
    id: ID!
    name: String
    description: String
  }

  # FIXME: turn back on when unions are supported in composition
  # type LibraryAccount @key(fields: "id") {
  #   id: ID!
  #   library: Library
  # }

  # extend union AccountType = LibraryAccount

  type Book @key(fields: "isbn") @cacheControl(maxAge: 700) {
    isbn: String!
    title: String
    year: Int
    similarBooks: [Book]!
    metadata: [MetadataOrError]
  }

  # Value type
  type KeyValue @shareable {
    key: String!
    value: String!
  }

  # Value type
  type Error @shareable {
    code: Int
    message: String
  }

  # Value type
  union MetadataOrError = KeyValue | Error
`;

const libraries = [{ id: '1', name: 'NYC Public Library' }];
const books = [
  {
    isbn: '0262510871',
    title: 'Structure and Interpretation of Computer Programs',
    year: 1996,
    metadata: [{ key: 'Condition', value: 'excellent' }],
  },
  {
    isbn: '0136291554',
    title: 'Object Oriented Software Construction',
    year: 1997,
    metadata: [
      { key: 'Condition', value: 'used' },
      { code: '401', message: 'Unauthorized' },
    ],
  },
  {
    isbn: '0201633612',
    title: 'Design Patterns',
    year: 1995,
    similarBooks: ['0201633612', '0136291554'],
    metadata: [{ key: 'Condition', value: 'like new' }],
  },
  {
    isbn: '1234567890',
    title: 'The Year Was Null',
    year: null,
  },
  {
    isbn: '404404404',
    title: '',
    year: 404,
  },
  {
    isbn: '0987654321',
    title: 'No Books Like This Book!',
    year: 2019,
    similarBooks: ['', null],
  },
];

export const resolvers: GraphQLResolverMap<any> = {
  Book: {
    __resolveReference(object) {
      return books.find(book => book.isbn === object.isbn);
    },
    similarBooks(object) {
      return object.similarBooks
        ? object.similarBooks
            .map((isbn: string) => books.find(book => book.isbn === isbn))
            .filter(Boolean)
        : [];
    },
  },
  Library: {
    __resolveReference(object) {
      return libraries.find(library => library.id === object.id);
    },
  },
  Query: {
    book(_, args) {
      return books.find(book => book.isbn === args.isbn);
    },
    books() {
      return books;
    },
    library(_, { id }) {
      return libraries.find(library => library.id === id);
    },
  },
  MetadataOrError: {
    __resolveType(object) {
      return 'key' in object ? 'KeyValue' : 'Error';
    },
  },
};
