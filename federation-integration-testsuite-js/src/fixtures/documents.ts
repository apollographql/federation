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

  type Image implements NamedObject {
      name: String!
      # Same as option below but the type is different
      attributes: ImageAttributes!
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
