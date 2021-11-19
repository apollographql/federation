import {
  fixtures,
  fixturesWithoutTag,
} from 'apollo-federation-integration-testsuite';
import { parse, GraphQLError, visit, StringValueNode } from 'graphql';
import { composeServices } from '@apollo/composition';


describe('printSupergraphSdl', () => {
  let supergraphSdl: string, errors: GraphQLError[];

  beforeAll(() => {
    const compositionResult = composeServices(fixtures);
    if (compositionResult.errors) {
      errors = compositionResult.errors;
    } else {
      supergraphSdl = compositionResult.supergraphSdl;
    }
  });

  it('composes without errors', () => {
    expect(errors).toBeUndefined();
  });

  it('produces a parseable output', () => {
    expect(() => parse(supergraphSdl!)).not.toThrow();
  });

  it('prints a fully composed schema correctly', () => {
    expect(supergraphSdl).toMatchInlineSnapshot(`
      "schema
        @core(feature: \\"https://specs.apollo.dev/core/v0.2\\")
        @core(feature: \\"https://specs.apollo.dev/join/v0.2\\", for: EXECUTION)
        @core(feature: \\"https://specs.apollo.dev/tag/v0.1\\")
      {
        query: Query
        mutation: Mutation
      }

      directive @core(feature: String!, as: String, for: core__Purpose) repeatable on SCHEMA

      directive @join__field(graph: join__Graph!, requires: join__FieldSet, provides: join__FieldSet, type: String, external: Boolean) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @join__implements(graph: join__Graph!, interface: String!) repeatable on OBJECT | INTERFACE

      directive @join__type(graph: join__Graph!, key: join__FieldSet, extension: Boolean! = false) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

      directive @stream on FIELD

      directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

      directive @transform(from: String!) on FIELD

      union AccountType
        @join__type(graph: ACCOUNTS)
        @tag(name: \\"from-accounts\\")
       = PasswordAccount | SMSAccount

      type Amazon
        @join__type(graph: PRODUCT)
      {
        referrer: String
      }

      union Body
        @join__type(graph: DOCUMENTS)
       = Image | Text

      type Book implements Product
        @join__implements(graph: INVENTORY, interface: \\"Product\\")
        @join__implements(graph: PRODUCT, interface: \\"Product\\")
        @join__implements(graph: REVIEWS, interface: \\"Product\\")
        @join__type(graph: BOOKS, key: \\"isbn\\")
        @join__type(graph: INVENTORY, key: \\"isbn\\", extension: true)
        @join__type(graph: PRODUCT, key: \\"isbn\\", extension: true)
        @join__type(graph: REVIEWS, key: \\"isbn\\", extension: true)
      {
        isbn: String!
        title: String @join__field(graph: BOOKS) @join__field(graph: PRODUCT, external: true)
        year: Int @join__field(graph: BOOKS) @join__field(graph: PRODUCT, external: true)
        similarBooks: [Book]! @join__field(graph: BOOKS) @join__field(graph: REVIEWS, external: true)
        metadata: [MetadataOrError] @join__field(graph: BOOKS)
        inStock: Boolean @join__field(graph: INVENTORY)
        isCheckedOut: Boolean @join__field(graph: INVENTORY)
        upc: String! @join__field(graph: PRODUCT)
        sku: String! @join__field(graph: PRODUCT)
        name(delimeter: String = \\" \\"): String @join__field(graph: PRODUCT, requires: \\"title year\\")
        price: String @join__field(graph: PRODUCT)
        details: ProductDetailsBook @join__field(graph: PRODUCT)
        reviews: [Review] @join__field(graph: REVIEWS)
        relatedReviews: [Review!]! @join__field(graph: REVIEWS, requires: \\"similarBooks { isbn }\\")
      }

      union Brand
        @join__type(graph: PRODUCT)
       = Ikea | Amazon

      enum CacheControlScope
        @join__type(graph: ACCOUNTS)
        @join__type(graph: BOOKS)
        @join__type(graph: PRODUCT)
      {
        PUBLIC
        PRIVATE
      }

      type Car implements Vehicle
        @join__implements(graph: PRODUCT, interface: \\"Vehicle\\")
        @join__implements(graph: REVIEWS, interface: \\"Vehicle\\")
        @join__type(graph: PRODUCT, key: \\"id\\")
        @join__type(graph: REVIEWS, key: \\"id\\", extension: true)
      {
        id: String!
        description: String @join__field(graph: PRODUCT)
        price: String @join__field(graph: PRODUCT) @join__field(graph: REVIEWS, external: true)
        retailPrice: String @join__field(graph: REVIEWS, requires: \\"price\\")
      }

      enum core__Purpose {
        \\"\\"\\"
        \`SECURITY\` features provide metadata necessary to securely resolve fields.
        \\"\\"\\"
        SECURITY

        \\"\\"\\"
        \`EXECUTION\` features provide metadata necessary for operation execution.
        \\"\\"\\"
        EXECUTION
      }

      type Error
        @join__type(graph: BOOKS)
        @join__type(graph: PRODUCT)
        @join__type(graph: REVIEWS)
      {
        code: Int
        message: String
      }

      type Furniture implements Product
        @join__implements(graph: INVENTORY, interface: \\"Product\\")
        @join__implements(graph: PRODUCT, interface: \\"Product\\")
        @join__implements(graph: REVIEWS, interface: \\"Product\\")
        @join__type(graph: INVENTORY, key: \\"sku\\", extension: true)
        @join__type(graph: PRODUCT, key: \\"upc\\")
        @join__type(graph: PRODUCT, key: \\"sku\\")
        @join__type(graph: REVIEWS, key: \\"upc\\", extension: true)
      {
        sku: String! @join__field(graph: INVENTORY) @join__field(graph: PRODUCT)
        inStock: Boolean @join__field(graph: INVENTORY)
        isHeavy: Boolean @join__field(graph: INVENTORY)
        upc: String! @join__field(graph: PRODUCT) @join__field(graph: REVIEWS)
        name: String @join__field(graph: PRODUCT)
        price: String @join__field(graph: PRODUCT)
        brand: Brand @join__field(graph: PRODUCT)
        metadata: [MetadataOrError] @join__field(graph: PRODUCT)
        details: ProductDetailsFurniture @join__field(graph: PRODUCT)
        reviews: [Review] @join__field(graph: REVIEWS)
      }

      type Ikea
        @join__type(graph: PRODUCT)
      {
        asile: Int
      }

      type Image implements NamedObject
        @join__implements(graph: DOCUMENTS, interface: \\"NamedObject\\")
        @join__type(graph: DOCUMENTS)
      {
        name: String!
        attributes: ImageAttributes!
      }

      type ImageAttributes
        @join__type(graph: DOCUMENTS)
      {
        url: String!
      }

      scalar join__FieldSet

      enum join__Graph {
        ACCOUNTS @join__graph(name: \\"accounts\\", url: \\"https://accounts.api.com.invalid\\")
        BOOKS @join__graph(name: \\"books\\", url: \\"https://books.api.com.invalid\\")
        DOCUMENTS @join__graph(name: \\"documents\\", url: \\"https://documents.api.com.invalid\\")
        INVENTORY @join__graph(name: \\"inventory\\", url: \\"https://inventory.api.com.invalid\\")
        PRODUCT @join__graph(name: \\"product\\", url: \\"https://product.api.com.invalid\\")
        REVIEWS @join__graph(name: \\"reviews\\", url: \\"https://reviews.api.com.invalid\\")
      }

      scalar JSON
        @join__type(graph: ACCOUNTS)
        @specifiedBy(url: \\"https://json-spec.dev\\")

      type KeyValue
        @join__type(graph: BOOKS)
        @join__type(graph: PRODUCT)
        @join__type(graph: REVIEWS)
      {
        key: String!
        value: String!
      }

      type Library
        @join__type(graph: ACCOUNTS, key: \\"id\\", extension: true)
        @join__type(graph: BOOKS, key: \\"id\\")
      {
        id: ID!
        name: String @join__field(graph: ACCOUNTS, external: true) @join__field(graph: BOOKS)
        userAccount(id: ID! = 1): User @join__field(graph: ACCOUNTS, requires: \\"name\\")
      }

      union MetadataOrError
        @join__type(graph: BOOKS)
        @join__type(graph: PRODUCT)
        @join__type(graph: REVIEWS)
       = KeyValue | Error

      type Mutation
        @join__type(graph: ACCOUNTS)
        @join__type(graph: REVIEWS)
      {
        login(username: String!, password: String!, userId: String @deprecated(reason: \\"Use username instead\\")): User @join__field(graph: ACCOUNTS)
        reviewProduct(input: ReviewProduct!): Product @join__field(graph: REVIEWS)
        updateReview(review: UpdateReviewInput!): Review @join__field(graph: REVIEWS)
        deleteReview(id: ID!): Boolean @join__field(graph: REVIEWS)
      }

      type Name
        @join__type(graph: ACCOUNTS)
      {
        first: String
        last: String
      }

      interface NamedObject
        @join__type(graph: DOCUMENTS)
      {
        name: String!
      }

      type PasswordAccount
        @join__type(graph: ACCOUNTS, key: \\"email\\")
      {
        email: String!
      }

      interface Product
        @join__type(graph: INVENTORY)
        @join__type(graph: PRODUCT)
        @join__type(graph: REVIEWS)
        @tag(name: \\"from-reviews\\")
      {
        inStock: Boolean @join__field(graph: INVENTORY)
        upc: String! @join__field(graph: PRODUCT)
        sku: String! @join__field(graph: PRODUCT)
        name: String @join__field(graph: PRODUCT)
        price: String @join__field(graph: PRODUCT)
        details: ProductDetails @join__field(graph: PRODUCT)
        reviews: [Review] @join__field(graph: REVIEWS)
      }

      interface ProductDetails
        @join__type(graph: PRODUCT)
      {
        country: String
      }

      type ProductDetailsBook implements ProductDetails
        @join__implements(graph: PRODUCT, interface: \\"ProductDetails\\")
        @join__type(graph: PRODUCT)
      {
        country: String
        pages: Int
      }

      type ProductDetailsFurniture implements ProductDetails
        @join__implements(graph: PRODUCT, interface: \\"ProductDetails\\")
        @join__type(graph: PRODUCT)
      {
        country: String
        color: String
      }

      type Query
        @join__type(graph: ACCOUNTS)
        @join__type(graph: BOOKS)
        @join__type(graph: DOCUMENTS)
        @join__type(graph: INVENTORY)
        @join__type(graph: PRODUCT)
        @join__type(graph: REVIEWS)
      {
        user(id: ID!): User @join__field(graph: ACCOUNTS)
        me: User @join__field(graph: ACCOUNTS)
        book(isbn: String!): Book @join__field(graph: BOOKS)
        books: [Book] @join__field(graph: BOOKS)
        library(id: ID!): Library @join__field(graph: BOOKS)
        body: Body! @join__field(graph: DOCUMENTS)
        product(upc: String!): Product @join__field(graph: PRODUCT)
        vehicle(id: String!): Vehicle @join__field(graph: PRODUCT)
        topProducts(first: Int = 5): [Product] @join__field(graph: PRODUCT)
        topCars(first: Int = 5): [Car] @join__field(graph: PRODUCT)
        topReviews(first: Int = 5): [Review] @join__field(graph: REVIEWS)
      }

      type Review
        @join__type(graph: REVIEWS, key: \\"id\\")
      {
        id: ID!
        body(format: Boolean = false): String
        author: User @join__field(graph: REVIEWS, provides: \\"username\\")
        product: Product
        metadata: [MetadataOrError]
      }

      input ReviewProduct
        @join__type(graph: REVIEWS)
      {
        upc: String!
        body: String!
        stars: Int @deprecated(reason: \\"Stars are no longer in use\\")
      }

      type SMSAccount
        @join__type(graph: ACCOUNTS, key: \\"number\\")
      {
        number: String
      }

      type Text implements NamedObject
        @join__implements(graph: DOCUMENTS, interface: \\"NamedObject\\")
        @join__type(graph: DOCUMENTS)
      {
        name: String!
        attributes: TextAttributes!
      }

      type TextAttributes
        @join__type(graph: DOCUMENTS)
      {
        bold: Boolean
        text: String
      }

      union Thing
        @join__type(graph: PRODUCT)
       = Car | Ikea

      input UpdateReviewInput
        @join__type(graph: REVIEWS)
      {
        id: ID!
        body: String
      }

      type User
        @join__type(graph: ACCOUNTS, key: \\"id\\")
        @join__type(graph: ACCOUNTS, key: \\"username name { first last }\\")
        @join__type(graph: INVENTORY, key: \\"id\\", extension: true)
        @join__type(graph: PRODUCT, key: \\"id\\", extension: true)
        @join__type(graph: REVIEWS, key: \\"id\\", extension: true)
        @tag(name: \\"from-accounts\\")
        @tag(name: \\"from-reviews\\")
      {
        id: ID! @tag(name: \\"accounts\\")
        name: Name @join__field(graph: ACCOUNTS)
        username: String @join__field(graph: ACCOUNTS) @join__field(graph: REVIEWS, external: true)
        birthDate(locale: String): String @tag(name: \\"admin\\") @tag(name: \\"dev\\") @join__field(graph: ACCOUNTS)
        account: AccountType @join__field(graph: ACCOUNTS)
        metadata: [UserMetadata] @join__field(graph: ACCOUNTS) @join__field(graph: INVENTORY, external: true) @join__field(graph: REVIEWS, external: true)
        ssn: String @join__field(graph: ACCOUNTS)
        goodDescription: Boolean @join__field(graph: INVENTORY, requires: \\"metadata { description }\\")
        vehicle: Vehicle @join__field(graph: PRODUCT)
        thing: Thing @join__field(graph: PRODUCT)
        reviews: [Review] @join__field(graph: REVIEWS)
        numberOfReviews: Int! @join__field(graph: REVIEWS)
        goodAddress: Boolean @join__field(graph: REVIEWS, requires: \\"metadata { address }\\")
      }

      type UserMetadata
        @join__type(graph: ACCOUNTS)
        @join__type(graph: INVENTORY)
        @join__type(graph: REVIEWS)
      {
        name: String @join__field(graph: ACCOUNTS)
        address: String @join__field(graph: ACCOUNTS) @join__field(graph: REVIEWS, external: true)
        description: String @join__field(graph: ACCOUNTS) @join__field(graph: INVENTORY, external: true)
      }

      type Van implements Vehicle
        @join__implements(graph: PRODUCT, interface: \\"Vehicle\\")
        @join__implements(graph: REVIEWS, interface: \\"Vehicle\\")
        @join__type(graph: PRODUCT, key: \\"id\\")
        @join__type(graph: REVIEWS, key: \\"id\\", extension: true)
      {
        id: String!
        description: String @join__field(graph: PRODUCT)
        price: String @join__field(graph: PRODUCT) @join__field(graph: REVIEWS, external: true)
        retailPrice: String @join__field(graph: REVIEWS, requires: \\"price\\")
      }

      interface Vehicle
        @join__type(graph: PRODUCT)
        @join__type(graph: REVIEWS)
      {
        id: String! @join__field(graph: PRODUCT)
        description: String @join__field(graph: PRODUCT)
        price: String @join__field(graph: PRODUCT)
        retailPrice: String @join__field(graph: REVIEWS)
      }"
    `);
  });

  it('prints a fully composed schema without @tag correctly', () => {
    const compositionResult = composeServices(fixturesWithoutTag);
    if (compositionResult.errors) {
      errors = compositionResult.errors;
    } else {
      supergraphSdl = compositionResult.supergraphSdl;
    }

    expect(supergraphSdl).toMatchInlineSnapshot(`
      "schema
        @core(feature: \\"https://specs.apollo.dev/core/v0.2\\")
        @core(feature: \\"https://specs.apollo.dev/join/v0.2\\", for: EXECUTION)
      {
        query: Query
        mutation: Mutation
      }

      directive @core(feature: String!, as: String, for: core__Purpose) repeatable on SCHEMA

      directive @join__field(graph: join__Graph!, requires: join__FieldSet, provides: join__FieldSet, type: String, external: Boolean) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @join__implements(graph: join__Graph!, interface: String!) repeatable on OBJECT | INTERFACE

      directive @join__type(graph: join__Graph!, key: join__FieldSet, extension: Boolean! = false) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

      directive @stream on FIELD

      directive @transform(from: String!) on FIELD

      union AccountType
        @join__type(graph: ACCOUNTS)
       = PasswordAccount | SMSAccount

      type Amazon
        @join__type(graph: PRODUCT)
      {
        referrer: String
      }

      union Body
        @join__type(graph: DOCUMENTS)
       = Image | Text

      type Book implements Product
        @join__implements(graph: INVENTORY, interface: \\"Product\\")
        @join__implements(graph: PRODUCT, interface: \\"Product\\")
        @join__implements(graph: REVIEWS, interface: \\"Product\\")
        @join__type(graph: BOOKS, key: \\"isbn\\")
        @join__type(graph: INVENTORY, key: \\"isbn\\", extension: true)
        @join__type(graph: PRODUCT, key: \\"isbn\\", extension: true)
        @join__type(graph: REVIEWS, key: \\"isbn\\", extension: true)
      {
        isbn: String!
        title: String @join__field(graph: BOOKS) @join__field(graph: PRODUCT, external: true)
        year: Int @join__field(graph: BOOKS) @join__field(graph: PRODUCT, external: true)
        similarBooks: [Book]! @join__field(graph: BOOKS) @join__field(graph: REVIEWS, external: true)
        metadata: [MetadataOrError] @join__field(graph: BOOKS)
        inStock: Boolean @join__field(graph: INVENTORY)
        isCheckedOut: Boolean @join__field(graph: INVENTORY)
        upc: String! @join__field(graph: PRODUCT)
        sku: String! @join__field(graph: PRODUCT)
        name(delimeter: String = \\" \\"): String @join__field(graph: PRODUCT, requires: \\"title year\\")
        price: String @join__field(graph: PRODUCT)
        details: ProductDetailsBook @join__field(graph: PRODUCT)
        reviews: [Review] @join__field(graph: REVIEWS)
        relatedReviews: [Review!]! @join__field(graph: REVIEWS, requires: \\"similarBooks { isbn }\\")
      }

      union Brand
        @join__type(graph: PRODUCT)
       = Ikea | Amazon

      enum CacheControlScope
        @join__type(graph: BOOKS)
        @join__type(graph: PRODUCT)
      {
        PUBLIC
        PRIVATE
      }

      type Car implements Vehicle
        @join__implements(graph: PRODUCT, interface: \\"Vehicle\\")
        @join__implements(graph: REVIEWS, interface: \\"Vehicle\\")
        @join__type(graph: PRODUCT, key: \\"id\\")
        @join__type(graph: REVIEWS, key: \\"id\\", extension: true)
      {
        id: String!
        description: String @join__field(graph: PRODUCT)
        price: String @join__field(graph: PRODUCT) @join__field(graph: REVIEWS, external: true)
        retailPrice: String @join__field(graph: REVIEWS, requires: \\"price\\")
      }

      enum core__Purpose {
        \\"\\"\\"
        \`SECURITY\` features provide metadata necessary to securely resolve fields.
        \\"\\"\\"
        SECURITY

        \\"\\"\\"
        \`EXECUTION\` features provide metadata necessary for operation execution.
        \\"\\"\\"
        EXECUTION
      }

      type Error
        @join__type(graph: BOOKS)
        @join__type(graph: PRODUCT)
        @join__type(graph: REVIEWS)
      {
        code: Int
        message: String
      }

      type Furniture implements Product
        @join__implements(graph: INVENTORY, interface: \\"Product\\")
        @join__implements(graph: PRODUCT, interface: \\"Product\\")
        @join__implements(graph: REVIEWS, interface: \\"Product\\")
        @join__type(graph: INVENTORY, key: \\"sku\\", extension: true)
        @join__type(graph: PRODUCT, key: \\"upc\\")
        @join__type(graph: PRODUCT, key: \\"sku\\")
        @join__type(graph: REVIEWS, key: \\"upc\\", extension: true)
      {
        sku: String! @join__field(graph: INVENTORY) @join__field(graph: PRODUCT)
        inStock: Boolean @join__field(graph: INVENTORY)
        isHeavy: Boolean @join__field(graph: INVENTORY)
        upc: String! @join__field(graph: PRODUCT) @join__field(graph: REVIEWS)
        name: String @join__field(graph: PRODUCT)
        price: String @join__field(graph: PRODUCT)
        brand: Brand @join__field(graph: PRODUCT)
        metadata: [MetadataOrError] @join__field(graph: PRODUCT)
        details: ProductDetailsFurniture @join__field(graph: PRODUCT)
        reviews: [Review] @join__field(graph: REVIEWS)
      }

      type Ikea
        @join__type(graph: PRODUCT)
      {
        asile: Int
      }

      type Image implements NamedObject
        @join__implements(graph: DOCUMENTS, interface: \\"NamedObject\\")
        @join__type(graph: DOCUMENTS)
      {
        name: String!
        attributes: ImageAttributes!
      }

      type ImageAttributes
        @join__type(graph: DOCUMENTS)
      {
        url: String!
      }

      scalar join__FieldSet

      enum join__Graph {
        ACCOUNTS @join__graph(name: \\"accounts\\", url: \\"https://accounts.api.com.invalid\\")
        BOOKS @join__graph(name: \\"books\\", url: \\"https://books.api.com.invalid\\")
        DOCUMENTS @join__graph(name: \\"documents\\", url: \\"https://documents.api.com.invalid\\")
        INVENTORY @join__graph(name: \\"inventory\\", url: \\"https://inventory.api.com.invalid\\")
        PRODUCT @join__graph(name: \\"product\\", url: \\"https://product.api.com.invalid\\")
        REVIEWS @join__graph(name: \\"reviews\\", url: \\"https://reviews.api.com.invalid\\")
      }

      type KeyValue
        @join__type(graph: BOOKS)
        @join__type(graph: PRODUCT)
        @join__type(graph: REVIEWS)
      {
        key: String!
        value: String!
      }

      type Library
        @join__type(graph: ACCOUNTS, key: \\"id\\", extension: true)
        @join__type(graph: BOOKS, key: \\"id\\")
      {
        id: ID!
        name: String @join__field(graph: ACCOUNTS, external: true) @join__field(graph: BOOKS)
        userAccount(id: ID! = 1): User @join__field(graph: ACCOUNTS, requires: \\"name\\")
      }

      union MetadataOrError
        @join__type(graph: BOOKS)
        @join__type(graph: PRODUCT)
        @join__type(graph: REVIEWS)
       = KeyValue | Error

      type Mutation
        @join__type(graph: ACCOUNTS)
        @join__type(graph: REVIEWS)
      {
        login(username: String!, password: String!): User @join__field(graph: ACCOUNTS)
        reviewProduct(input: ReviewProduct): Product @join__field(graph: REVIEWS)
        updateReview(review: UpdateReviewInput!): Review @join__field(graph: REVIEWS)
        deleteReview(id: ID!): Boolean @join__field(graph: REVIEWS)
      }

      type Name
        @join__type(graph: ACCOUNTS)
      {
        first: String
        last: String
      }

      interface NamedObject
        @join__type(graph: DOCUMENTS)
      {
        name: String!
      }

      type PasswordAccount
        @join__type(graph: ACCOUNTS, key: \\"email\\")
      {
        email: String!
      }

      interface Product
        @join__type(graph: INVENTORY)
        @join__type(graph: PRODUCT)
        @join__type(graph: REVIEWS)
      {
        inStock: Boolean @join__field(graph: INVENTORY)
        upc: String! @join__field(graph: PRODUCT)
        sku: String! @join__field(graph: PRODUCT)
        name: String @join__field(graph: PRODUCT)
        price: String @join__field(graph: PRODUCT)
        details: ProductDetails @join__field(graph: PRODUCT)
        reviews: [Review] @join__field(graph: REVIEWS)
      }

      interface ProductDetails
        @join__type(graph: PRODUCT)
      {
        country: String
      }

      type ProductDetailsBook implements ProductDetails
        @join__implements(graph: PRODUCT, interface: \\"ProductDetails\\")
        @join__type(graph: PRODUCT)
      {
        country: String
        pages: Int
      }

      type ProductDetailsFurniture implements ProductDetails
        @join__implements(graph: PRODUCT, interface: \\"ProductDetails\\")
        @join__type(graph: PRODUCT)
      {
        country: String
        color: String
      }

      type Query
        @join__type(graph: ACCOUNTS)
        @join__type(graph: BOOKS)
        @join__type(graph: DOCUMENTS)
        @join__type(graph: INVENTORY)
        @join__type(graph: PRODUCT)
        @join__type(graph: REVIEWS)
      {
        user(id: ID!): User @join__field(graph: ACCOUNTS)
        me: User @join__field(graph: ACCOUNTS)
        book(isbn: String!): Book @join__field(graph: BOOKS)
        books: [Book] @join__field(graph: BOOKS)
        library(id: ID!): Library @join__field(graph: BOOKS)
        body: Body! @join__field(graph: DOCUMENTS)
        product(upc: String!): Product @join__field(graph: PRODUCT)
        vehicle(id: String!): Vehicle @join__field(graph: PRODUCT)
        topProducts(first: Int = 5): [Product] @join__field(graph: PRODUCT)
        topCars(first: Int = 5): [Car] @join__field(graph: PRODUCT)
        topReviews(first: Int = 5): [Review] @join__field(graph: REVIEWS)
      }

      type Review
        @join__type(graph: REVIEWS, key: \\"id\\")
      {
        id: ID!
        body(format: Boolean = false): String
        author: User @join__field(graph: REVIEWS, provides: \\"username\\")
        product: Product
        metadata: [MetadataOrError]
      }

      input ReviewProduct
        @join__type(graph: REVIEWS)
      {
        upc: String!
        body: String!
        stars: Int @deprecated(reason: \\"Stars are no longer in use\\")
      }

      type SMSAccount
        @join__type(graph: ACCOUNTS, key: \\"number\\")
      {
        number: String
      }

      type Text implements NamedObject
        @join__implements(graph: DOCUMENTS, interface: \\"NamedObject\\")
        @join__type(graph: DOCUMENTS)
      {
        name: String!
        attributes: TextAttributes!
      }

      type TextAttributes
        @join__type(graph: DOCUMENTS)
      {
        bold: Boolean
        text: String
      }

      union Thing
        @join__type(graph: PRODUCT)
       = Car | Ikea

      input UpdateReviewInput
        @join__type(graph: REVIEWS)
      {
        id: ID!
        body: String
      }

      type User
        @join__type(graph: ACCOUNTS, key: \\"id\\")
        @join__type(graph: ACCOUNTS, key: \\"username name { first last }\\")
        @join__type(graph: INVENTORY, key: \\"id\\", extension: true)
        @join__type(graph: PRODUCT, key: \\"id\\", extension: true)
        @join__type(graph: REVIEWS, key: \\"id\\", extension: true)
      {
        id: ID!
        name: Name @join__field(graph: ACCOUNTS)
        username: String @join__field(graph: ACCOUNTS) @join__field(graph: REVIEWS, external: true)
        birthDate(locale: String): String @join__field(graph: ACCOUNTS)
        account: AccountType @join__field(graph: ACCOUNTS)
        metadata: [UserMetadata] @join__field(graph: ACCOUNTS) @join__field(graph: INVENTORY, external: true) @join__field(graph: REVIEWS, external: true)
        ssn: String @join__field(graph: ACCOUNTS)
        goodDescription: Boolean @join__field(graph: INVENTORY, requires: \\"metadata { description }\\")
        vehicle: Vehicle @join__field(graph: PRODUCT)
        thing: Thing @join__field(graph: PRODUCT)
        reviews: [Review] @join__field(graph: REVIEWS)
        numberOfReviews: Int! @join__field(graph: REVIEWS)
        goodAddress: Boolean @join__field(graph: REVIEWS, requires: \\"metadata { address }\\")
      }

      type UserMetadata
        @join__type(graph: ACCOUNTS)
        @join__type(graph: INVENTORY)
        @join__type(graph: REVIEWS)
      {
        name: String @join__field(graph: ACCOUNTS)
        address: String @join__field(graph: ACCOUNTS) @join__field(graph: REVIEWS, external: true)
        description: String @join__field(graph: ACCOUNTS) @join__field(graph: INVENTORY, external: true)
      }

      type Van implements Vehicle
        @join__implements(graph: PRODUCT, interface: \\"Vehicle\\")
        @join__implements(graph: REVIEWS, interface: \\"Vehicle\\")
        @join__type(graph: PRODUCT, key: \\"id\\")
        @join__type(graph: REVIEWS, key: \\"id\\", extension: true)
      {
        id: String!
        description: String @join__field(graph: PRODUCT)
        price: String @join__field(graph: PRODUCT) @join__field(graph: REVIEWS, external: true)
        retailPrice: String @join__field(graph: REVIEWS, requires: \\"price\\")
      }

      interface Vehicle
        @join__type(graph: PRODUCT)
        @join__type(graph: REVIEWS)
      {
        id: String! @join__field(graph: PRODUCT)
        description: String @join__field(graph: PRODUCT)
        price: String @join__field(graph: PRODUCT)
        retailPrice: String @join__field(graph: REVIEWS)
      }"
    `);
  });

  it('fieldsets are parseable', () => {
    const parsedSupergraphSdl = parse(supergraphSdl!);
    const fieldSets: string[] = [];

    // Collect all args with the `key`, `provides`, and `requires` fields
    // Note: if our testing schema ever begins to include a directive with args
    // that use any of these names, this test will likely fail and will need to
    // be a bit less heavy-handed by searching for the specific directives
    // instead of by argument name.
    const argNames = ['key', 'requires', 'provides'];
    visit(parsedSupergraphSdl, {
      Argument(node) {
        if (argNames.includes(node.name.value)) {
          fieldSets.push((node.value as StringValueNode).value);
        }
      },
    });

    // Ensure we're actually finding fieldSets, else this will fail quietly
    expect(fieldSets).not.toHaveLength(0);
    // Ensure each fieldSet arg is graphql parseable (when wrapped in curlies, as we do elsewhere)
    fieldSets.forEach((unparsed) => {
      expect(() => parse('{' + unparsed + '}')).not.toThrow();
    });
  });
});
