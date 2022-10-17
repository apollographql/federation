import { GraphQLResolverMap } from '../resolverMap';
import { fed2gql as gql } from '../utils/fed2gql';

export const name = 'documents';
export const url = `https://${name}.api.com.invalid`;
export const typeDefs = gql`
  directive @stream on FIELD
  directive @transform(from: String!) on FIELD

  type Query {
    body: Body!
  }

  union Body = Image | Text

  interface NamedObject {
    name: String!
  }

  interface WebResource {
    resourceUrl: String
  }

  type Image implements NamedObject & WebResource @key(fields: "name") {
      name: String!
      # Same as option below but the type is different
      attributes: ImageAttributes!
      resourceUrl: String
  }

  type Text implements NamedObject {
      name: String!
      # Same as option above but the type is different
      attributes: TextAttributes!
  }

  type ImageAttributes {
    url: String!
  }

  type TextAttributes {
    bold: Boolean
    text: String
  }
`;

export const resolvers: GraphQLResolverMap<unknown> = {
  Image: {
    __resolveReference: (image: { name: string }) => {
      return {
        name: image.name,
        resourceUrl: `https://images.com/${image.name}`,
        attributes: { url: 'https://example.com/image.jpg' },
      };
    }
  }
}
