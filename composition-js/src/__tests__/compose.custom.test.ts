import { composeServices, CompositionResult } from '../compose';
import {
  assert,
  Schema,
  ServiceDefinition,
} from '@apollo/federation-internals';
import gql from 'graphql-tag';
import './matchers';
import { GraphQLError } from 'graphql';

const expectDirectiveOnElement = (schema: Schema, location: string, directiveName: string, props?: { [key: string]: any }) => {
  const elem = schema.elementByCoordinate(location);
  expect(elem).toBeDefined();
  const directive = elem?.appliedDirectives.find(d => {
    if (d.name !== directiveName) {
      return false;
    }
    if (props) {
      for (const prop in props) {
        if (d.arguments()[prop] !== props[prop]) {
          return false;
        }
      }
    }
    return true;
  });
  expect(directive).toBeDefined();
};

const expectNoDirectiveOnElement = (schema: Schema, location: string, directiveName: string) => {
  const elem = schema.elementByCoordinate(location);
  expect(elem).toBeDefined();
  expect(elem?.hasAppliedDirective(directiveName)).toBe(false);
};

const expectNoErrorsOrHints = (result: CompositionResult): Schema => {
  expect(result.errors).toBeUndefined();
  expect(result.hints).toHaveLength(0);
  const { schema } = result;
  expect(schema).toBeDefined();
  assert(schema, 'schema does not exist');
  return schema;
}

const expectNoDirectiveInSchema = (schema: Schema, directiveName: string) => {
  expect(schema.directive(directiveName)).toBeUndefined();
};


describe('composing custom directives', () => {
  it('executable only directive should be rejected', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        directive @foo(name: String!) on QUERY
        type Query {
          a: User
        }

        type User @key(fields: "id") {
          id: Int
          name: String
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        directive @foo(name: String!) on QUERY
        type User @key(fields: "id") {
          id: Int
          description: String
        }
      `,
    };
    const result = composeServices([subgraphA, subgraphB], { mergeDirectives: ['@foo']});
    expect(result.errors).toBeDefined();
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]).toEqual(new GraphQLError('Directive "@foo" cannot be specified in "mergeDirectives" argument because all its locations are executable'));
  });

  it('mixed executable/type system directive, custom directive not exposed', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        directive @foo(name: String!) on QUERY | FIELD_DEFINITION
        type Query {
          a: User
        }

        type User @key(fields: "id") {
          id: Int
          name: String @foo(name: "graphA")
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        directive @foo(name: String!) on QUERY | FIELD_DEFINITION
        type User @key(fields: "id") {
          id: Int
          description: String @foo(name: "graphB")
        }
      `,
    };
    const result = composeServices([subgraphA, subgraphB]);
    const schema = expectNoErrorsOrHints(result);
    expectNoDirectiveOnElement(schema, 'User.name', 'foo');
    expectNoDirectiveOnElement(schema, 'User.description', 'foo');
    expect(schema.directive('foo')?.name).toBe('foo');
    expect(schema.directive('foo')?.locations).toEqual(['QUERY']);
  });

  it('mixed executable/type system directive, custom directive exposed', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        directive @foo(name: String!) on QUERY | FIELD_DEFINITION
        type Query {
          a: User
        }

        type User @key(fields: "id") {
          id: Int
          name: String @foo(name: "graphA")
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        directive @foo(name: String!) on QUERY | FIELD_DEFINITION
        type User @key(fields: "id") {
          id: Int
          description: String @foo(name: "graphB")
        }
      `,
    };
    const result = composeServices([subgraphA, subgraphB], { mergeDirectives: ['@foo']});
    const schema = expectNoErrorsOrHints(result);
    expectDirectiveOnElement(schema, 'User.name', 'foo', { name: 'graphA'});
    expectDirectiveOnElement(schema, 'User.description', 'foo', { name: 'graphB'});
    expect(schema.directive('foo')?.name).toBe('foo');
    expect(schema.directive('foo')?.locations).toEqual(['QUERY', 'FIELD_DEFINITION']);
  });

  it('mixed executable/type system directive, custom directive exposed. union / intersection', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        directive @foo(name: String!) on QUERY | MUTATION | SUBSCRIPTION | FIELD | FIELD_DEFINITION
        type Query {
          a: User
        }

        type User @key(fields: "id") {
          id: Int
          name: String @foo(name: "graphA")
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        directive @foo(name: String!) on QUERY | SUBSCRIPTION | MUTATION | FIELD_DEFINITION | OBJECT
        type User @key(fields: "id") {
          id: Int
          description: String @foo(name: "graphB")
        }
      `,
    };

    const subgraphC = {
      name: 'subgraphC',
      typeDefs: gql`
        directive @foo(name: String!) on QUERY | MUTATION | FIELD_DEFINITION | INTERFACE
        type User @key(fields: "id") {
          id: Int
          anotherField: String @foo(name: "graphC")
        }
      `,
    };
    const result = composeServices([subgraphA, subgraphB, subgraphC], { mergeDirectives: ['@foo']});
    expect(result.errors).toBeUndefined();
    expect(result.hints).toHaveLength(1);
    const { schema } = result;
    expect(schema).toBeDefined();
    assert(schema, 'schema does not exist');
    expectDirectiveOnElement(schema, 'User.name', 'foo', { name: 'graphA'});
    expectDirectiveOnElement(schema, 'User.description', 'foo', { name: 'graphB'});
    expectDirectiveOnElement(schema, 'User.anotherField', 'foo', { name: 'graphC'});
    expect(schema.directive('foo')?.name).toBe('foo');
    expect(schema.directive('foo')?.locations).toEqual(['QUERY', 'MUTATION', 'FIELD_DEFINITION', 'OBJECT', 'INTERFACE']);
  });

  it('mixed executable/type system directive, conflicting definitions not exposed', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        directive @foo(name: String!) on QUERY
        type Query {
          a: User
        }

        type User @key(fields: "id") {
          id: Int
          name: String
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        directive @foo(name: String!) on QUERY | FIELD_DEFINITION | OBJECT
        type User @key(fields: "id") @foo(name: "objectB") {
          id: Int
          description: String @foo(name: "graphB")
        }
      `,
    };
    const result = composeServices([subgraphA, subgraphB]);
    const schema = expectNoErrorsOrHints(result);
    expectNoDirectiveOnElement(schema, 'User', 'foo');
    expectNoDirectiveOnElement(schema, 'User.description', 'foo');
    expect(schema.directive('foo')?.name).toBe('foo');
    expect(schema.directive('foo')?.locations).toEqual(['QUERY']);
  });

  it('mixed executable/type system directive, conflicting definitions, exposed', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        directive @foo(name: String!) on QUERY
        type Query {
          a: User
        }

        type User @key(fields: "id") {
          id: Int
          name: String
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        directive @foo(name: String!) on QUERY | FIELD_DEFINITION | OBJECT
        type User @key(fields: "id") @foo(name: "objectB") {
          id: Int
          description: String @foo(name: "graphB")
        }
      `,
    };
    const result = composeServices([subgraphA, subgraphB], { mergeDirectives: ['@foo']});
    const schema = expectNoErrorsOrHints(result);
    expectDirectiveOnElement(schema, 'User.description', 'foo', { name: 'graphB'});
    expectDirectiveOnElement(schema, 'User', 'foo', { name: 'objectB'});
    expect(schema.directive('foo')?.name).toBe('foo');
    expect(schema.directive('foo')?.locations).toEqual(['QUERY', 'FIELD_DEFINITION', 'OBJECT']);
  });

  it('mixed executable/type system directive, incompatible definitions, exposed', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        directive @foo(name: String!, desc: String!) on QUERY | FIELD_DEFINITION
        type Query {
          a: User
        }

        type User @key(fields: "id") {
          id: Int
          name: String @foo(name: "graphA", desc: "descA")
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        directive @foo(name: String!) on QUERY | FIELD_DEFINITION | OBJECT
        type User @key(fields: "id") @foo(name: "objectB") {
          id: Int
          description: String @foo(name: "graphB")
        }
      `,
    };
    const result = composeServices([subgraphA, subgraphB], { mergeDirectives: ['@foo']});
    expect(result.errors).toBeDefined();
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]).toEqual(new GraphQLError('Argument "@foo(desc:)" is required in some subgraphs but does not appear in all subgraphs: it is required in subgraph "subgraphA" but does not appear in subgraph "subgraphB"'));
  });

  it('type system directive, incompatible definitions, exposed', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        directive @foo(name: String!, desc: String!) on FIELD_DEFINITION
        type Query {
          a: User
        }

        type User @key(fields: "id") {
          id: Int
          name: String @foo(name: "graphA", desc: "descA")
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        directive @foo(name: String!) on FIELD_DEFINITION | OBJECT
        type User @key(fields: "id") @foo(name: "objectB") {
          id: Int
          description: String @foo(name: "graphB")
        }
      `,
    };
    const result = composeServices([subgraphA, subgraphB], { mergeDirectives: ['@foo']});
    expect(result.errors).toBeDefined();
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]).toEqual(new GraphQLError('Argument "@foo(desc:)" is required in some subgraphs but does not appear in all subgraphs: it is required in subgraph "subgraphA" but does not appear in subgraph "subgraphB"'));
  });

  it('type system directive, incompatible definitions, not exposed', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        directive @foo(name: String!, desc: String!) on FIELD_DEFINITION
        type Query {
          a: User
        }

        type User @key(fields: "id") {
          id: Int
          name: String @foo(name: "graphA", desc: "descA")
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        directive @foo(name: String!) on FIELD_DEFINITION | OBJECT
        type User @key(fields: "id") @foo(name: "objectB") {
          id: Int
          description: String @foo(name: "graphB")
        }
      `,
    };
    const result = composeServices([subgraphA, subgraphB]);
    const schema = expectNoErrorsOrHints(result);
    expectNoDirectiveOnElement(schema, 'User', 'foo');
    expectNoDirectiveOnElement(schema, 'User.description', 'foo');
    expect(schema.directive('foo')).toBeUndefined();
  });

  it('type-system directive, not exposed', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        directive @foo(name: String!) on FIELD_DEFINITION
        type Query {
          a: User
        }

        type User @key(fields: "id") {
          id: Int
          name: String @foo(name: "graphA")
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        directive @foo(name: String!) on FIELD_DEFINITION
        type User @key(fields: "id") {
          id: Int
          description: String @foo(name: "graphB")
        }
      `,
    };
    const result = composeServices([subgraphA, subgraphB]);
    const schema = expectNoErrorsOrHints(result);
    expectNoDirectiveInSchema(schema, 'foo');
    expectNoDirectiveOnElement(schema, 'User.name', 'foo');
  });

  it('type-system directive, exposed', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        directive @foo(name: String!) on FIELD_DEFINITION
        type Query {
          a: User
        }

        type User @key(fields: "id") {
          id: Int
          name: String @foo(name: "graphA")
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        directive @foo(name: String!) on FIELD_DEFINITION
        type User @key(fields: "id") {
          id: Int
          description: String @foo(name: "graphB")
        }
      `,
    };
    const result = composeServices([subgraphA, subgraphB], { mergeDirectives: ['@foo']});
    const schema = expectNoErrorsOrHints(result);
    expectDirectiveOnElement(schema, 'User.name', 'foo', { name: 'graphA'});
  });

  it('type-system directive, repeatable sometimes', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        directive @foo(name: String!) repeatable on FIELD_DEFINITION
        type Query {
          a: User
        }

        type User @key(fields: "id") {
          id: Int
          name: String @foo(name: "graphA")
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        directive @foo(name: String!) on FIELD_DEFINITION
        type User @key(fields: "id") {
          id: Int
          description: String @foo(name: "graphB")
        }
      `,
    };
    const result = composeServices([subgraphA, subgraphB], { mergeDirectives: ['@foo']});
    expect(result.errors).toBeUndefined();
    expect(result.hints).toHaveLength(1);
    expect(result.hints?.[0].definition.code).toBe('INCONSISTENT_TYPE_SYSTEM_DIRECTIVE_REPEATABLE');
    const { schema } = result;
    expect(schema).toBeDefined();
    if (schema) {
      expectDirectiveOnElement(schema, 'User.name', 'foo', { name: 'graphA'});
    }
  });

  it('type-system directive, different locations', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        directive @foo(name: String!) on FIELD_DEFINITION | OBJECT
        type Query {
          a: User
        }

        type User @key(fields: "id") @foo(name: "objectA") {
          id: Int
          name: String @foo(name: "graphA")
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        directive @foo(name: String!) on FIELD_DEFINITION
        type User @key(fields: "id") {
          id: Int
          description: String @foo(name: "graphB")
        }
      `,
    };
    const result = composeServices([subgraphA, subgraphB], { mergeDirectives: ['@foo']});
    expect(result.hints).toHaveLength(1);
    expect(result.hints?.[0].message).toBe('Type system directive "@foo" has inconsistent locations across subgraphs and will use locations "FIELD_DEFINITION, OBJECT" (union of all subgraphs) in the supergraph, but has: locations "FIELD_DEFINITION, OBJECT" in subgraph "subgraphA" and location "FIELD_DEFINITION" in subgraph "subgraphB".');
    const { schema } = result;
    expect(schema).toBeDefined();
    if (schema) {
      expectDirectiveOnElement(schema, 'User.name', 'foo', { name: 'graphA'});
      expectDirectiveOnElement(schema, 'User', 'foo', { name: 'objectA'});
      expect(schema.directive('foo')?.locations).toEqual(['FIELD_DEFINITION', 'OBJECT']);
    }
  });

  it('type-system directive, core feature, not exposed', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
      extend schema
        @link(url: "https://specs.apollo.dev/link/v1.0")
        @link(url: "https://specs.apollo.dev/join/v0.2", for: EXECUTION)
        @link(url: "https://specs.apollo.dev/foo/v1.0", import: ["@foo"])

        directive @foo(name: String!) on FIELD_DEFINITION

        type Query {
          a: User
        }

        type User @key(fields: "id") {
          id: Int
          name: String @foo(name: "graphA")
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
      extend schema
        @link(url: "https://specs.apollo.dev/link/v1.0")
        @link(url: "https://specs.apollo.dev/join/v0.2", for: EXECUTION)
        @link(url: "https://specs.apollo.dev/foo/v1.0", import: ["@foo"])

        directive @foo(name: String!) on FIELD_DEFINITION

        type User @key(fields: "id") {
          id: Int
          description: String @foo(name: "graphB")
        }
      `,
    };
    const result = composeServices([subgraphA, subgraphB]);
    const schema = expectNoErrorsOrHints(result);
    expectNoDirectiveInSchema(schema, 'foo');
    expectNoDirectiveOnElement(schema, 'User.name', 'foo');
  });

  it('type-system directive, core feature, directive exposed', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
      extend schema
        @link(url: "https://specs.apollo.dev/link/v1.0")
        @link(url: "https://specs.apollo.dev/join/v0.2", for: EXECUTION)
        @link(url: "https://specs.apollo.dev/foo/v1.0", import: ["@foo"])

        directive @foo(name: String!) on FIELD_DEFINITION

        type Query {
          a: User
        }

        type User @key(fields: "id") {
          id: Int
          name: String @foo(name: "graphA")
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
      extend schema
        @link(url: "https://specs.apollo.dev/link/v1.0")
        @link(url: "https://specs.apollo.dev/join/v0.2", for: EXECUTION)
        @link(url: "https://specs.apollo.dev/foo/v1.0", import: ["@foo"])

        directive @foo(name: String!) on FIELD_DEFINITION

        type User @key(fields: "id") {
          id: Int
          description: String @foo(name: "graphB")
        }
      `,
    };
    const result = composeServices([subgraphA, subgraphB], { mergeDirectives: ['@foo']});
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0].message).toBe(`Directive "@foo" cannot be specified in "mergeDirectives" argument because it is linked via a core feature in at least one subgraph`);
  });
});

describe('invocation errors', () => {
  let subgraphA: ServiceDefinition;
  let subgraphB: ServiceDefinition;
  beforeAll(() => {
    subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        extend schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", { name: "@tag", as: "@customTag"}])

        directive @tag(name: String!) on QUERY | FIELD_DEFINITION
        type Query {
          a: User
        }

        type User @key(fields: "id") {
          id: Int
          name: String @tag(name: "graphA")
        }
      `,
    };

    subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        extend schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", { name: "@tag", as: "@customTag"}])

        directive @tag(name: String!) on QUERY | FIELD_DEFINITION
        type User @key(fields: "id") {
          id: Int
          description: String @tag(name: "graphB")
        }
      `,
    };
  });

  it('directive does not exist', () => {
    const result = composeServices([subgraphA, subgraphB], { mergeDirectives: ['@tagg']});
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0].message).toBe(`Directive "@tagg" in "mergeDirectives" argument does not exist in any subgraph. Did you mean \"@tag\"?`);
  });

  it('no leading "@" in directive name', () => {
    const result = composeServices([subgraphA, subgraphB], { mergeDirectives: ['foo']});
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0].message).toBe(`Directive "foo" in "mergeDirectives" argument does not begin with a "@"`);
  });

  it.each(['@skip', '@include', '@deprecated', '@specifiedBy'])('attempt to expose builtin directive', (directiveName) => {
    const result = composeServices([subgraphA, subgraphB], { mergeDirectives: [directiveName]});
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0].message).toBe(`Built-in directive "${directiveName}" cannot be specified in "mergeDirectives" because built-ins are already merged by default`);
  });

  it.each(['@key', '@link', '@customTag'])('fed 2 directives are rejected. Even if they are aliased', (directive) => {
    const result = composeServices([subgraphA, subgraphB], { mergeDirectives: [directive]});
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0].message).toBe(`Directive "${directive}" cannot be specified in "mergeDirectives" argument because it is linked via a core feature in at least one subgraph`);
  });

  it('custom @tag still composes as long as federation version is renamed', () => {
    const result = composeServices([subgraphA, subgraphB], { mergeDirectives: ['@tag']});
    const schema = expectNoErrorsOrHints(result);
    expectDirectiveOnElement(schema, 'User.name', 'tag', { name: 'graphA'});
    expectDirectiveOnElement(schema, 'User.description', 'tag', { name: 'graphB'});
    expect(schema.directive('tag')?.name).toBe('tag');
    expect(schema.directive('tag')?.locations).toEqual(['QUERY', 'FIELD_DEFINITION']);
  });

  it('custom @tag still composes with no import', () => {
    const subgraphC = {
      name: 'subgraphC',
      typeDefs: gql`
        extend schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(url: "https://specs.apollo.dev/federation/v2.0")

        directive @tag(name: String!) on QUERY | FIELD_DEFINITION
        type Query {
          a: User
        }

        type User @federation__key(fields: "id") {
          id: Int
          name: String @tag(name: "graphA")
        }
      `,
    };

    const subgraphD = {
      name: 'subgraphD',
      typeDefs: gql`
        extend schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(url: "https://specs.apollo.dev/federation/v2.0")

        directive @tag(name: String!) on QUERY | FIELD_DEFINITION
        type User @federation__key(fields: "id") {
          id: Int
          description: String @tag(name: "graphB")
        }
      `,
    };

    const result = composeServices([subgraphC, subgraphD], { mergeDirectives: ['@tag']});
    const schema = expectNoErrorsOrHints(result);
    expectDirectiveOnElement(schema, 'User.name', 'tag', { name: 'graphA'});
    expectDirectiveOnElement(schema, 'User.description', 'tag', { name: 'graphB'});
    expect(schema.directive('tag')?.name).toBe('tag');
    expect(schema.directive('tag')?.locations).toEqual(['QUERY', 'FIELD_DEFINITION']);
  });
});
