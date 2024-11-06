import {gql} from "../../utils";

export const typeDefs = gql`
  extend schema
  @link(url: "https://specs.apollo.dev/link/v1.0")
  @link(
    url: "https://specs.apollo.dev/federation/v2.1"
    import: [
      "@key"
      "@shareable"
      "@inaccessible"
      "@external"
      "@provides"
      "@requires"
    ]
  )

  type TempType @key(fields: "id") {
    id: ID!
    dep2: Int 
  }
`;

export const resolvers = {
  TempType: {
    dep2: () => {
      throw new Error('This is a custom error message');
    },
  },
};