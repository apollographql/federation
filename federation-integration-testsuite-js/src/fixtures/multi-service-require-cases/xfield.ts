import {gql} from "../../utils";

export const typeDefs = gql`
  extend schema
  @link(url: "https://specs.apollo.dev/link/v1.0")
  @link(
    url: "https://specs.apollo.dev/federation/v2.1"
    import: [
      "@key"
      "@shareable"
      "@composeDirective"
      "@external"
      "@requires"
    ]
  )

  type TempType
  @key(fields: "id") { #  <--------------- ENTITY
    id: ID!
    dep1: Int! @external
    dep2: Int @external
    xfield: Int @requires(fields: "dep1 dep2")
  }
`;

export const resolvers = {
  TempType: {
    xfield: (
        arg1: { dep2: number | null; dep1: number | null },
    ) => {
      if (arg1.dep2 == null) {
        return arg1.dep1;
      }
      if (arg1.dep1 == null) {
        return arg1.dep2;
      }
      return arg1.dep1 * arg1.dep2;
    },
  },
};