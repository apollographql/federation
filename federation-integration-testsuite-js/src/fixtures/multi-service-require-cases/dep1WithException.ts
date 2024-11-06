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
      "@requires"
    ]
  )

  type TempType @key(fields: "id") {
    id: ID!
    dep1: Int!
  }
`;

export const resolvers = {
  TempType: {
    dep1: () => {
      throw new Error('This is a custom error message dep1 non-nullable');
    },
  },
};