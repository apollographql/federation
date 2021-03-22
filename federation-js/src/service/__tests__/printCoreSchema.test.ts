import { fixtures } from 'apollo-federation-integration-testsuite';
import { parse, GraphQLError, visit, StringValueNode } from 'graphql';
import { composeAndValidate, compositionHasErrors } from '../../composition';

describe('printCoreSchema', () => {
  let coreSchema: string, errors: GraphQLError[];

  beforeAll(() => {
    // composeAndValidate calls `printComposedSdl` to return `composedSdl`
    const compositionResult = composeAndValidate(fixtures);
    if (compositionHasErrors(compositionResult)) {
      errors = compositionResult.errors;
    } else {
      coreSchema = compositionResult.coreSchema;
    }
  });

  it('composes without errors', () => {
    expect(errors).toBeUndefined();
  });

  it('produces a parseable output', () => {
    try {
      parse(coreSchema);
    } catch (e) {
      console.log(JSON.stringify(e));
    }
    expect(() => parse(coreSchema!)).not.toThrow();
  });

  it('prints a fully composed schema correctly', () => {
    expect(coreSchema).toMatchInlineSnapshot(`
      "schema
        @core(feature: \\"https://lib.apollo.dev/core/v0.1\\"),
        @core(feature: \\"https://lib.apollo.dev/join/v0.1\\")
      {
        query: Query
        mutation: Mutation
      }

      directive @core(feature: String!) repeatable on SCHEMA

      directive @join__field(graph: join__Graph, requires: join__FieldSet, provides: join__FieldSet) on FIELD_DEFINITION

      directive @join__type(graph: join__Graph, key: join__FieldSet) repeatable on OBJECT | INTERFACE

      directive @join__owner(graph: join__Graph) on OBJECT | INTERFACE

      directive @join__endpoint(serviceName: String, url: String) on ENUM_VALUE

      directive @stream on FIELD

      directive @transform(from: String!) on FIELD

      union AccountType = PasswordAccount | SMSAccount

      type Amazon {
        referrer: String @join__field(graph: PRODUCT)
      }

      union Body = Image | Text

      type Book implements Product
        @join__owner(graph: BOOKS)
        @join__type(graph: BOOKS, key: \\"isbn\\")
        @join__type(graph: INVENTORY, key: \\"isbn\\")
        @join__type(graph: PRODUCT, key: \\"isbn\\")
        @join__type(graph: REVIEWS, key: \\"isbn\\")
      {
        isbn: String! @join__field(graph: BOOKS)
        title: String @join__field(graph: BOOKS)
        year: Int @join__field(graph: BOOKS)
        similarBooks: [Book]! @join__field(graph: BOOKS)
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

      union Brand = Ikea | Amazon

      type Car implements Vehicle
        @join__owner(graph: PRODUCT)
        @join__type(graph: PRODUCT, key: \\"id\\")
        @join__type(graph: REVIEWS, key: \\"id\\")
      {
        id: String! @join__field(graph: PRODUCT)
        description: String @join__field(graph: PRODUCT)
        price: String @join__field(graph: PRODUCT)
        retailPrice: String @join__field(graph: REVIEWS, requires: \\"price\\")
      }

      type Error {
        code: Int
        message: String
      }

      type Furniture implements Product
        @join__owner(graph: PRODUCT)
        @join__type(graph: PRODUCT, key: \\"upc\\")
        @join__type(graph: PRODUCT, key: \\"sku\\")
        @join__type(graph: INVENTORY, key: \\"sku\\")
        @join__type(graph: REVIEWS, key: \\"upc\\")
      {
        upc: String! @join__field(graph: PRODUCT)
        sku: String! @join__field(graph: PRODUCT)
        name: String @join__field(graph: PRODUCT)
        price: String @join__field(graph: PRODUCT)
        brand: Brand @join__field(graph: PRODUCT)
        metadata: [MetadataOrError] @join__field(graph: PRODUCT)
        details: ProductDetailsFurniture @join__field(graph: PRODUCT)
        inStock: Boolean @join__field(graph: INVENTORY)
        isHeavy: Boolean @join__field(graph: INVENTORY)
        reviews: [Review] @join__field(graph: REVIEWS)
      }

      type Ikea {
        asile: Int @join__field(graph: PRODUCT)
      }

      type Image {
        name: String! @join__field(graph: DOCUMENTS)
        attributes: ImageAttributes! @join__field(graph: DOCUMENTS)
      }

      type ImageAttributes {
        url: String! @join__field(graph: DOCUMENTS)
      }

      scalar join__FieldSet

      enum join__Graph {
        ACCOUNTS @join__endpoint(serviceName: \\"accounts\\" url: \\"https://accounts.api.com\\")
        BOOKS @join__endpoint(serviceName: \\"books\\" url: \\"https://books.api.com\\")
        DOCUMENTS @join__endpoint(serviceName: \\"documents\\" url: \\"https://documents.api.com\\")
        INVENTORY @join__endpoint(serviceName: \\"inventory\\" url: \\"https://inventory.api.com\\")
        PRODUCT @join__endpoint(serviceName: \\"product\\" url: \\"https://product.api.com\\")
        REVIEWS @join__endpoint(serviceName: \\"reviews\\" url: \\"https://reviews.api.com\\")
      }

      type KeyValue {
        key: String!
        value: String!
      }

      type Library
        @join__owner(graph: BOOKS)
        @join__type(graph: BOOKS, key: \\"id\\")
        @join__type(graph: ACCOUNTS, key: \\"id\\")
      {
        id: ID! @join__field(graph: BOOKS)
        name: String @join__field(graph: BOOKS)
        userAccount(id: ID! = 1): User @join__field(graph: ACCOUNTS, requires: \\"name\\")
      }

      union MetadataOrError = KeyValue | Error

      type Mutation {
        login(username: String!, password: String!): User @join__field(graph: ACCOUNTS)
        reviewProduct(upc: String!, body: String!): Product @join__field(graph: REVIEWS)
        updateReview(review: UpdateReviewInput!): Review @join__field(graph: REVIEWS)
        deleteReview(id: ID!): Boolean @join__field(graph: REVIEWS)
      }

      type Name {
        first: String @join__field(graph: ACCOUNTS)
        last: String @join__field(graph: ACCOUNTS)
      }

      type PasswordAccount
        @join__owner(graph: ACCOUNTS)
        @join__type(graph: ACCOUNTS, key: \\"email\\")
      {
        email: String! @join__field(graph: ACCOUNTS)
      }

      interface Product {
        upc: String! @join__field(graph: PRODUCT)
        sku: String! @join__field(graph: PRODUCT)
        name: String @join__field(graph: PRODUCT)
        price: String @join__field(graph: PRODUCT)
        details: ProductDetails @join__field(graph: PRODUCT)
        inStock: Boolean @join__field(graph: PRODUCT)
        reviews: [Review] @join__field(graph: PRODUCT)
      }

      interface ProductDetails {
        country: String @join__field(graph: PRODUCT)
      }

      type ProductDetailsBook implements ProductDetails {
        country: String @join__field(graph: PRODUCT)
        pages: Int @join__field(graph: PRODUCT)
      }

      type ProductDetailsFurniture implements ProductDetails {
        country: String @join__field(graph: PRODUCT)
        color: String @join__field(graph: PRODUCT)
      }

      type Query {
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
        @join__owner(graph: REVIEWS)
        @join__type(graph: REVIEWS, key: \\"id\\")
      {
        id: ID! @join__field(graph: REVIEWS)
        body(format: Boolean = false): String @join__field(graph: REVIEWS)
        author: User @join__field(graph: REVIEWS, provides: \\"username\\")
        product: Product @join__field(graph: REVIEWS)
        metadata: [MetadataOrError] @join__field(graph: REVIEWS)
      }

      type SMSAccount
        @join__owner(graph: ACCOUNTS)
        @join__type(graph: ACCOUNTS, key: \\"number\\")
      {
        number: String @join__field(graph: ACCOUNTS)
      }

      type Text {
        name: String! @join__field(graph: DOCUMENTS)
        attributes: TextAttributes! @join__field(graph: DOCUMENTS)
      }

      type TextAttributes {
        bold: Boolean @join__field(graph: DOCUMENTS)
        text: String @join__field(graph: DOCUMENTS)
      }

      union Thing = Car | Ikea

      input UpdateReviewInput {
        id: ID!
        body: String
      }

      type User
        @join__owner(graph: ACCOUNTS)
        @join__type(graph: ACCOUNTS, key: \\"id\\")
        @join__type(graph: ACCOUNTS, key: \\"username name { first last }\\")
        @join__type(graph: INVENTORY, key: \\"id\\")
        @join__type(graph: PRODUCT, key: \\"id\\")
        @join__type(graph: REVIEWS, key: \\"id\\")
      {
        id: ID! @join__field(graph: ACCOUNTS)
        name: Name @join__field(graph: ACCOUNTS)
        username: String @join__field(graph: ACCOUNTS)
        birthDate(locale: String): String @join__field(graph: ACCOUNTS)
        account: AccountType @join__field(graph: ACCOUNTS)
        metadata: [UserMetadata] @join__field(graph: ACCOUNTS)
        goodDescription: Boolean @join__field(graph: INVENTORY, requires: \\"metadata { description }\\")
        vehicle: Vehicle @join__field(graph: PRODUCT)
        thing: Thing @join__field(graph: PRODUCT)
        reviews: [Review] @join__field(graph: REVIEWS)
        numberOfReviews: Int! @join__field(graph: REVIEWS)
        goodAddress: Boolean @join__field(graph: REVIEWS, requires: \\"metadata { address }\\")
      }

      type UserMetadata {
        name: String @join__field(graph: ACCOUNTS)
        address: String @join__field(graph: ACCOUNTS)
        description: String @join__field(graph: ACCOUNTS)
      }

      type Van implements Vehicle
        @join__owner(graph: PRODUCT)
        @join__type(graph: PRODUCT, key: \\"id\\")
        @join__type(graph: REVIEWS, key: \\"id\\")
      {
        id: String! @join__field(graph: PRODUCT)
        description: String @join__field(graph: PRODUCT)
        price: String @join__field(graph: PRODUCT)
        retailPrice: String @join__field(graph: REVIEWS, requires: \\"price\\")
      }

      interface Vehicle {
        id: String! @join__field(graph: PRODUCT)
        description: String @join__field(graph: PRODUCT)
        price: String @join__field(graph: PRODUCT)
        retailPrice: String @join__field(graph: PRODUCT)
      }
      "
    `);
  });

  it('fieldsets are parseable', () => {
    const parsedCsdl = parse(coreSchema!);
    const fieldSets: string[] = [];

    // Collect all args with the `key`, `provides`, and `requires` fields
    // Note: if our testing schema ever begins to include a directive with args
    // that use any of these names, this test will likely fail and will need to
    // be a bit less heavy-handed by searching for the specific directives
    // instead of by argument name.
    const argNames = ['key', 'requires', 'provides'];
    visit(parsedCsdl, {
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
