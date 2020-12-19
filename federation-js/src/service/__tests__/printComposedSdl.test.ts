import { fixtures } from 'apollo-federation-integration-testsuite';
import { composeAndValidate } from '../../composition';
import { parse, GraphQLError, visit, StringValueNode } from 'graphql';

describe('printComposedSdl', () => {
  let composedSdl: string | undefined, errors: GraphQLError[];

  beforeAll(() => {
    // composeAndValidate calls `printComposedSdl` to return `composedSdl`
    ({ composedSdl, errors } = composeAndValidate(fixtures));
  });

  it('composes without errors', () => {
    expect(errors).toHaveLength(0);
  });

  it('produces a parseable output', () => {
    expect(() => parse(composedSdl!)).not.toThrow();
  });

  it('prints a fully composed schema correctly', () => {
    expect(composedSdl).toMatchInlineSnapshot(`
      "schema
        @using(spec: \\"https://specs.apollo.dev/cs/v0.1\\")
      {
        query: Query
        mutation: Mutation
      }

      enum cs_Graph {
        accounts @cs_link(to: { http: { url: \\"https://accounts.api.com\\" } }),
        books @cs_link(to: { http: { url: \\"https://books.api.com\\" } }),
        documents @cs_link(to: { http: { url: \\"https://documents.api.com\\" } }),
        inventory @cs_link(to: { http: { url: \\"https://inventory.api.com\\" } }),
        product @cs_link(to: { http: { url: \\"https://product.api.com\\" } }),
        reviews @cs_link(to: { http: { url: \\"https://reviews.api.com\\" } })
      }

      directive @graph(name: String!, url: String!) repeatable on SCHEMA

      directive @owner(graph: String!) on OBJECT

      directive @key(fields: String!, graph: String!) repeatable on OBJECT

      directive @resolve(graph: String!) on FIELD_DEFINITION

      directive @provides(fields: String!) on FIELD_DEFINITION

      directive @requires(fields: String!) on FIELD_DEFINITION

      directive @using(spec: String!) on SCHEMA

      directive @stream on FIELD

      directive @transform(from: String!) on FIELD

      union AccountType = PasswordAccount | SMSAccount

      type Amazon {
        referrer: String
      }

      union Body = Image | Text

      type Book implements Product
      {
        isbn: String!
        title: String
        year: Int
        similarBooks: [Book]!
        metadata: [MetadataOrError]
        inStock: Boolean @cs__resolve(graph: inventory)
        isCheckedOut: Boolean @cs__resolve(graph: inventory)
        upc: String! @cs__resolve(graph: product)
        sku: String! @cs__resolve(graph: product)
        name(delimeter: String = \\" \\"): String @cs__resolve(graph: product, requires: \\"{ title year }\\")
        price: String @cs__resolve(graph: product)
        details: ProductDetailsBook @cs__resolve(graph: product)
        reviews: [Review] @cs__resolve(graph: reviews)
        relatedReviews: [Review!]! @cs__resolve(graph: reviews, requires: \\"{ similarBooks { isbn } }\\")
      }
      fragment cs__keyFor_Book_0 on Book @cs__key(graph: books) { isbn }
      fragment cs__keyFor_Book_1 on Book @cs__key(graph: inventory) { isbn }
      fragment cs__keyFor_Book_2 on Book @cs__key(graph: product) { isbn }
      fragment cs__keyFor_Book_3 on Book @cs__key(graph: reviews) { isbn }

      union Brand = Ikea | Amazon

      type Car implements Vehicle
      {
        id: String!
        description: String
        price: String
        retailPrice: String @cs__resolve(graph: reviews, requires: \\"{ price }\\")
      }
      fragment cs__keyFor_Car_4 on Car @cs__key(graph: product) { id }
      fragment cs__keyFor_Car_5 on Car @cs__key(graph: reviews) { id }

      type Error {
        code: Int
        message: String
      }

      type Furniture implements Product
      {
        upc: String!
        sku: String!
        name: String
        price: String
        brand: Brand
        metadata: [MetadataOrError]
        details: ProductDetailsFurniture
        inStock: Boolean @cs__resolve(graph: inventory)
        isHeavy: Boolean @cs__resolve(graph: inventory)
        reviews: [Review] @cs__resolve(graph: reviews)
      }
      fragment cs__keyFor_Furniture_6 on Furniture @cs__key(graph: inventory) { sku }
      fragment cs__keyFor_Furniture_7 on Furniture @cs__key(graph: product) { upc }
      fragment cs__keyFor_Furniture_8 on Furniture @cs__key(graph: product) { sku }
      fragment cs__keyFor_Furniture_9 on Furniture @cs__key(graph: reviews) { upc }

      type Ikea {
        asile: Int
      }

      type Image {
        name: String!
        attributes: ImageAttributes!
      }

      type ImageAttributes {
        url: String!
      }

      type KeyValue {
        key: String!
        value: String!
      }

      type Library
      {
        id: ID!
        name: String
        userAccount(id: ID! = 1): User @cs__resolve(graph: accounts, requires: \\"{ name }\\")
      }
      fragment cs__keyFor_Library_10 on Library @cs__key(graph: accounts) { id }
      fragment cs__keyFor_Library_11 on Library @cs__key(graph: books) { id }

      union MetadataOrError = KeyValue | Error

      type Mutation {
        login(username: String!, password: String!): User @cs__resolve(graph: accounts)
        reviewProduct(upc: String!, body: String!): Product @cs__resolve(graph: reviews)
        updateReview(review: UpdateReviewInput!): Review @cs__resolve(graph: reviews)
        deleteReview(id: ID!): Boolean @cs__resolve(graph: reviews)
      }

      type Name {
        first: String
        last: String
      }

      type PasswordAccount
      {
        email: String!
      }
      fragment cs__keyFor_PasswordAccount_12 on PasswordAccount @cs__key(graph: accounts) { email }

      interface Product {
        upc: String!
        sku: String!
        name: String
        price: String
        details: ProductDetails
        inStock: Boolean
        reviews: [Review]
      }

      interface ProductDetails {
        country: String
      }

      type ProductDetailsBook implements ProductDetails {
        country: String
        pages: Int
      }

      type ProductDetailsFurniture implements ProductDetails {
        country: String
        color: String
      }

      type Query {
        user(id: ID!): User @cs__resolve(graph: accounts)
        me: User @cs__resolve(graph: accounts)
        book(isbn: String!): Book @cs__resolve(graph: books)
        books: [Book] @cs__resolve(graph: books)
        library(id: ID!): Library @cs__resolve(graph: books)
        body: Body! @cs__resolve(graph: documents)
        product(upc: String!): Product @cs__resolve(graph: product)
        vehicle(id: String!): Vehicle @cs__resolve(graph: product)
        topProducts(first: Int = 5): [Product] @cs__resolve(graph: product)
        topCars(first: Int = 5): [Car] @cs__resolve(graph: product)
        topReviews(first: Int = 5): [Review] @cs__resolve(graph: reviews)
      }

      type Review
      {
        id: ID!
        body(format: Boolean = false): String
        author: User @cs__resolve(graph: reviews, provides: \\"{ username }\\")
        product: Product
        metadata: [MetadataOrError]
      }
      fragment cs__keyFor_Review_13 on Review @cs__key(graph: reviews) { id }

      type SMSAccount
      {
        number: String
      }
      fragment cs__keyFor_SMSAccount_14 on SMSAccount @cs__key(graph: accounts) { number }

      type Text {
        name: String!
        attributes: TextAttributes!
      }

      type TextAttributes {
        bold: Boolean
        text: String
      }

      union Thing = Car | Ikea

      input UpdateReviewInput {
        id: ID!
        body: String
      }

      type User
      {
        id: ID!
        name: Name
        username: String
        birthDate(locale: String): String
        account: AccountType
        metadata: [UserMetadata]
        goodDescription: Boolean @cs__resolve(graph: inventory, requires: \\"{ metadata { description } }\\")
        vehicle: Vehicle @cs__resolve(graph: product)
        thing: Thing @cs__resolve(graph: product)
        reviews: [Review] @cs__resolve(graph: reviews)
        numberOfReviews: Int! @cs__resolve(graph: reviews)
        goodAddress: Boolean @cs__resolve(graph: reviews, requires: \\"{ metadata { address } }\\")
      }
      fragment cs__keyFor_User_15 on User @cs__key(graph: accounts) { id }
      fragment cs__keyFor_User_16 on User @cs__key(graph: accounts) { username name { first last } }
      fragment cs__keyFor_User_17 on User @cs__key(graph: inventory) { id }
      fragment cs__keyFor_User_18 on User @cs__key(graph: product) { id }
      fragment cs__keyFor_User_19 on User @cs__key(graph: reviews) { id }

      type UserMetadata {
        name: String
        address: String
        description: String
      }

      type Van implements Vehicle
      {
        id: String!
        description: String
        price: String
        retailPrice: String @cs__resolve(graph: reviews, requires: \\"{ price }\\")
      }
      fragment cs__keyFor_Van_20 on Van @cs__key(graph: product) { id }
      fragment cs__keyFor_Van_21 on Van @cs__key(graph: reviews) { id }

      interface Vehicle {
        id: String!
        description: String
        price: String
        retailPrice: String
      }
      "
    `);
  });

  it('fieldsets are parseable', () => {
    const parsedCsdl = parse(composedSdl!);
    const fieldSets: string[] = [];

    // Collect all args with the 'fields' name (from @key, @provides, @requires directives)
    visit(parsedCsdl, {
      Argument(node) {
        if (node.name.value === 'fields') {
          fieldSets.push((node.value as StringValueNode).value);
        }
      },
    });

    // Ensure each found 'fields' arg is graphql parseable
    fieldSets.forEach((unparsed) => {
      expect(() => parse(unparsed)).not.toThrow();
    });
  });
});
