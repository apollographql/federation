import { buildSchemaFromAST, federationBuiltIns, Subgraphs, buildSchema, printSchema } from '@apollo/core';
import { DocumentNode } from 'graphql';
import { CompositionResult, compose } from '../compose';
import gql from 'graphql-tag';

// TODO: this is the same than in definition.test.ts. Would be nice to extract somewhere (tough maybe there is
// a better, more jest-native, way to do this).
declare global {
  namespace jest {
    interface Matchers<R> {
      toMatchString(actual: string): R;
    }
  }
}

function deIndent(str: string): string {
  // Strip leading \n
  str = str.slice(str.search(/[^\n]/));
  // Strip trailing \n or space
  while (str.charAt(str.length - 1) === '\n' || str.charAt(str.length - 1) === ' ') {
    str = str.slice(0, str.length - 1);
  }
  const indent = str.search(/[^ ]/);
  return str
    .split('\n')
    .map(line => line.slice(indent))
    .join('\n');
}

expect.extend({
  toMatchString(expected: string, received: string) {
    received = deIndent(received);
    const pass = this.equals(expected, received);
    const message = pass
      ? () => this.utils.matcherHint('toMatchString', undefined, undefined)
          + '\n\n'
          + `Expected: not ${this.printExpected(expected)}`
      : () => {
        return (
          this.utils.matcherHint('toMatchString', undefined, undefined,)
          + '\n\n'
          + this.utils.printDiffOrStringify(expected, received, 'Expected', 'Received', true));
      };
    return {received, expected, message, name: 'toMatchString', pass};
  }
});

function composeDocuments(...documents: DocumentNode[]): CompositionResult {
  const subgraphs = new Subgraphs();
  let i = 1;
  for (const doc of documents) {
    const name = `Subgraph${i++}`;
    subgraphs.add(name, `https://${name}`, buildSchemaFromAST(doc, federationBuiltIns));
  }
  return compose(subgraphs);
}

test('simple composition generate valid supergraph', () => {
  const subgraph1 = gql`
    type Query {
      t: T
    }

    type T @key(fields: "k") {
      k: ID
    }
  `;

  const subgraph2 = gql`
    type T @key(fields: "k") {
      k: ID
      a: Int
      b: String
    }
  `;

  const result = composeDocuments(subgraph1, subgraph2);
  expect(result.errors).toBeUndefined();

  // Note that we could user `result.schema`, but reparsing to ensure we don't lose anything with printing/parsing.
  const schema = buildSchema(result.supergraphSdl!);
  expect(schema.isCoreSchema()).toBeTruthy();

  expect(result.supergraphSdl!).toMatchString(`
    schema
      @core(feature: "https://specs.apollo.dev/core/v0.2")
      @core(feature: "https://specs.apollo.dev/join/v0.2", for: "EXECUTION")
    {
      query: Query
    }

    directive @core(feature: String!, as: String, for: core__Purpose) repeatable on SCHEMA

    directive @join__field(graph: join__Graph!, requires: join__FieldSet, provides: join__FieldSet) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

    directive @join__graph(name: String!, url: String!) on ENUM_VALUE

    directive @join__implements(graph: join__Graph!, interface: String!) repeatable on OBJECT | INTERFACE

    directive @join__type(graph: join__Graph!, key: join__FieldSet, extension: Boolean! = false) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

    enum core__Purpose {
      SECURITY
      EXECUTION
    }

    scalar join__FieldSet

    enum join__Graph {
      SUBGRAPH1 @join__graph(name: "Subgraph1", url: "https://Subgraph1")
      SUBGRAPH2 @join__graph(name: "Subgraph2", url: "https://Subgraph2")
    }

    type Query
      @join__type(graph: "SUBGRAPH1")
      @join__type(graph: "SUBGRAPH2")
    {
      t: T @join__field(graph: "SUBGRAPH1")
    }

    type T
      @join__type(graph: "SUBGRAPH1", key: "k")
      @join__type(graph: "SUBGRAPH2", key: "k")
    {
      k: ID
      a: Int @join__field(graph: "SUBGRAPH2")
      b: String @join__field(graph: "SUBGRAPH2")
    }
  `);

  expect(printSchema(schema.toAPISchema())).toMatchString(`
    type Query {
      t: T
    }

    type T {
      k: ID
      a: Int
      b: String
    }
  `);
})

test('composition preserves descriptions', () => {
  const subgraph1 = gql`
    "A cool schema"
    schema {
      query: Query
    }

    """
    Available queries
    Not much yet
    """
    type Query {
      "Returns tea"
      t(
        "An argument that is very important"
        x: String!
      ): String
    }
  `;

  const subgraph2 = gql`
    "An enum"
    enum E {
      "The A value"
      A
      "The B value"
      B
    }
  `;

  const result = composeDocuments(subgraph1, subgraph2);
  expect(result.errors).toBeUndefined();

  // Note that we could user `result.schema`, but reparsing to ensure we don't lose anything with printing/parsing.
  const schema = buildSchema(result.supergraphSdl!);
  expect(schema.isCoreSchema()).toBeTruthy();

  expect(printSchema(schema.toAPISchema())).toMatchString(`
    """A cool schema"""
    schema {
      query: Query
    }

    """An enum"""
    enum E {
      """The A value"""
      A

      """The B value"""
      B
    }

    """
    Available queries
    Not much yet
    """
    type Query {
      """Returns tea"""
      t(
        """An argument that is very important"""
        x: String!
      ): String
    }
  `);
})
