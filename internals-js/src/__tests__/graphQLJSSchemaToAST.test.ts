import {
  buildClientSchema,
  buildSchema,
  GraphQLSchema,
  introspectionFromSchema,
  print
} from "graphql";
import { graphQLJSSchemaToAST } from "../graphQLJSSchemaToAST";
import './matchers';

function validateRoundtrip(schemaStr: string, expectedWithoutASTNodes: string | undefined = schemaStr) {
  const schema = buildSchema(schemaStr);
  expect(print(graphQLJSSchemaToAST(schema))).toMatchString(schemaStr);
  if (expectedWithoutASTNodes) {
    expect(print(graphQLJSSchemaToAST(withoutASTNodes(schema)))).toMatchString(expectedWithoutASTNodes);
  }
}

function withoutASTNodes(schema: GraphQLSchema): GraphQLSchema {
  return buildClientSchema(introspectionFromSchema(schema));
}

it('round-trip for all type definitions', () => {
  const schema = `
    type Query {
      a: A
      b: B
      c: C
      d(arg: D): Int
    }

    interface I {
      x: Int
    }

    type A implements I {
      x: Int
      y: Int
    }

    union B = A | Query

    enum C {
      V1
      V2
    }

    input D {
      m: Int
      n: Int = 3
    }
  `;

  validateRoundtrip(schema);
});

it('round-trip with default arguments', () => {
  const schemaFct = (v: string) => `
    type Query {
      f(arg: V = ${v}): Int
    }

    input V {
      x: Int
      y: Int = 3
    }
  `;

  const schema = schemaFct('{x: 2}');
  // We go through introspection to ensure the AST nodes are
  // removed, but that also somehow expand default values (which is
  // fine, we just have to account for it in our assertion).
  const schemaWithDefaultExpanded = schemaFct('{x: 2, y: 3}');

  validateRoundtrip(schema, schemaWithDefaultExpanded);
});

it('round-trip for directive definitions and applications', () => {
  const directiveDefinitions = `directive @schemaDirective(v: Int!) on SCHEMA

    directive @typeDirective repeatable on OBJECT

    directive @fieldDirective(s: String, m: Int = 3) on FIELD_DEFINITION
  `;

  const schema = `
    schema @schemaDirective(v: 3) {
      query: Query
    }

    type Query @typeDirective @typeDirective {
      f: Int @fieldDirective(s: "foo")
      g: Int @deprecated
    }

    ${directiveDefinitions}
  `;

  // With the ast nodes removed, we lose custom directive applications
  const noApplications = `
    type Query {
      f: Int
      g: Int @deprecated
    }

    ${directiveDefinitions}
  `;

  validateRoundtrip(schema, noApplications);
});

it('round-trip with extensions', () => {
  const common = `scalar federation_FieldSet

    scalar link_Import

    directive @link(url: String!, import: link_Import) on SCHEMA

    directive @key(fields: federation_FieldSet) repeatable on OBJECT
  `;

  const schema = `
    extend schema @link(url: "https://specs.apollo.dev", import: ["@key"])

    type Query {
      t: T
    }

    type T

    extend type T @key(fields: "id") {
      id: ID!
      x: Int
    }

    ${common}
  `;

  // No AST means we lose both the directive applications, but also whether something is an
  // extension or not.
  const noAST = `
    type Query {
      t: T
    }

    type T {
      id: ID!
      x: Int
    }

    ${common}
    `;

  validateRoundtrip(schema, noAST);
});

