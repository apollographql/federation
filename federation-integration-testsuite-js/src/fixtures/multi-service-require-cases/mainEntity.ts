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
    myText: String
  }
  type Query {
    getTemp(id: ID): TempType
  }
`;

export const resolvers = {
  Query: {
    getTemp: () => {
      return {
        id: 123134431,
        myText: 'this is a sample',
      };
    },
  },
};