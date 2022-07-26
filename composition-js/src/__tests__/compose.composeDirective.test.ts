import { assert, FEDERATION2_LINK_WTH_FULL_IMPORTS, Schema } from '@apollo/federation-internals';
import { DirectiveLocation } from 'graphql';
import gql from 'graphql-tag';
import { composeServices, CompositionResult } from '../compose';
import { errors } from './compose.test';

const generateSubgraph = ({
  name,
  linkText = '',
  composeText = '',
  directiveText = '',
  usage = '',
}: {
  name: string,
  linkText?: string,
  composeText?: string,
  directiveText?: string,
  usage?: string,
}) => {
  return {
    name: name,
    typeDefs: gql`
    extend schema
      ${FEDERATION2_LINK_WTH_FULL_IMPORTS}
      @link(url: "https://specs.apollo.dev/link/v1.0")
      ${linkText}
      ${composeText}

      ${directiveText}
      type Query {
        ${name}: User
      }
      type User @key(fields: "id") {
        id: Int
        ${name}: String ${usage}
      }
    `,
  };
};

const hints = (result: CompositionResult): [string,string][] => {
  return result.hints?.map(hint => ([hint.definition.code, hint.message])) ?? [];
};

const expectDirectiveOnElement = (schema: Schema, coordinate: string, directiveName: string, props?: { [key: string]: any }) => {
  const elem = schema.elementByCoordinate(coordinate);
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

const expectNoErrors = (result: CompositionResult, hintArr: [string,string][] = []): Schema => {
  expect(hints(result)).toStrictEqual(hintArr);
  expect(errors(result)).toStrictEqual([]);
  const { schema } = result;
  expect(schema).toBeDefined();
  assert(schema, 'schema does not exist');
  return schema;
}

const expectDirectiveDefinition = (schema: Schema, name: string, locations: DirectiveLocation[], args: string[]) => {
  const directive = schema.directive(name);
  expect(directive?.locations).toEqual(locations);
  expect(directive?.arguments().map(arg => arg.name)).toEqual(args);
};

const expectCoreFeature = (schema: Schema, identity: string, version: string, imports: { [key: string]: string}[]) => {
  const feature = schema.coreFeatures?.getByIdentity(identity);
  expect(feature?.url.toString()).toBe(`${identity}/v${version}`);
  expect(feature?.imports).toEqual(imports);
};

describe('composing custom core directives', () => {
  it('simple success case', () => {
    const subgraphA = generateSubgraph({
      name: 'subgraphA',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v1.0", import: ["@foo"])',
      composeText: '@composeDirective(name: "@foo")',
      directiveText: 'directive @foo(name: String!) on FIELD_DEFINITION',
      usage: '@foo(name: "a")',
    });
    const subgraphB = generateSubgraph({
      name: 'subgraphB',
    });

    const result = composeServices([subgraphA, subgraphB]);
    const schema = expectNoErrors(result);
    expectDirectiveDefinition(schema, 'foo', [DirectiveLocation.FIELD_DEFINITION], ['name']);
    expectCoreFeature(schema, 'https://specs.apollo.dev/foo', '1.0', [{ name: '@foo' }]);
    expectDirectiveOnElement(schema, 'User.subgraphA', 'foo', { name: 'a' });
  });

  it('simple success case (composeDirective is renamed)', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.1", import: ["@key", { name: "@composeDirective", as: "@apolloCompose" }])
        @link(url: "https://specs.apollo.dev/link/v1.0")
        @link(url: "https://specs.apollo.dev/foo/v1.0", import: ["@foo"])
        @apolloCompose(name: "@foo")

        directive @foo(name: String!) on FIELD_DEFINITION
        type Query {
          a: User
        }
        type User @key(fields: "id") {
          id: Int
          a: String @foo(name: "a")
        }
      `,
    };

    const subgraphB = generateSubgraph({
      name: 'subgraphB',
    });

    const result = composeServices([subgraphA, subgraphB]);
    const schema = expectNoErrors(result);
    expectDirectiveDefinition(schema, 'foo', [DirectiveLocation.FIELD_DEFINITION], ['name']);
    expectCoreFeature(schema, 'https://specs.apollo.dev/foo', '1.0', [{ name: '@foo' }]);
    expectDirectiveOnElement(schema, 'User.a', 'foo', { name: 'a' });
  });

  it('different major versions of core feature results in hint if not composed', () => {
    const subgraphA = generateSubgraph({
      name: 'subgraphA',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v1.0", import: ["@foo"])',
      directiveText: 'directive @foo(name: String!) on FIELD_DEFINITION',
      usage: '@foo(name: "a")',
    });
    const subgraphB = generateSubgraph({
      name: 'subgraphB',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v2.0", import: ["@foo"])',
      directiveText: 'directive @foo(name: String!) on FIELD_DEFINITION',
      usage: '@foo(name: "b")',
    });

    const result = composeServices([subgraphA, subgraphB]);
    expect(errors(result)).toStrictEqual([]);
    expect(hints(result)).toStrictEqual([
      ['DIRECTIVE_COMPOSITION_INFO', 'Non-composed core feature "https://specs.apollo.dev/foo" has major version mismatch across subgraphs'],
    ]);
  });

  it('multiple version mismatches should result in a single hint, not multiple', () => {
    const subgraphA = generateSubgraph({
      name: 'subgraphA',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v5.0", import: ["@foo"])',
      directiveText: 'directive @foo(name: String!) on FIELD_DEFINITION',
      usage: '@foo(name: "a")',
    });
    const subgraphB = generateSubgraph({
      name: 'subgraphB',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v2.0", import: ["@foo"])',
      directiveText: 'directive @foo(name: String!) on FIELD_DEFINITION',
      usage: '@foo(name: "b")',
    });
    const subgraphC = generateSubgraph({
      name: 'subgraphC',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v3.0", import: ["@foo"])',
      directiveText: 'directive @foo(name: String!) on FIELD_DEFINITION',
      usage: '@foo(name: "")',
    });
    const subgraphD = generateSubgraph({
      name: 'subgraphD',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v1.0", import: ["@foo"])',
      directiveText: 'directive @foo(name: String!) on FIELD_DEFINITION',
      usage: '@foo(name: "b")',
    });

    const result = composeServices([subgraphA, subgraphB, subgraphC, subgraphD]);
    expect(errors(result)).toStrictEqual([]);
    expect(hints(result)).toStrictEqual([
      ['DIRECTIVE_COMPOSITION_INFO', 'Non-composed core feature "https://specs.apollo.dev/foo" has major version mismatch across subgraphs'],
    ]);
  });

  it('different major versions of core feature results in error if composed', () => {
    const subgraphA = generateSubgraph({
      name: 'subgraphA',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v1.0", import: ["@foo"])',
      composeText: '@composeDirective(name: "@foo")',
      directiveText: 'directive @foo(name: String!) on FIELD_DEFINITION',
      usage: '@foo(name: "a")',
    });
    const subgraphB = generateSubgraph({
      name: 'subgraphB',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v2.0", import: ["@foo"])',
      composeText: '@composeDirective(name: "@foo")',
      directiveText: 'directive @foo(name: String!) on FIELD_DEFINITION',
      usage: '@foo(name: "b")',
    });

    const result = composeServices([subgraphA, subgraphB]);
    expect(errors(result)).toStrictEqual([
      [
        'DIRECTIVE_COMPOSITION_ERROR',
        'Core feature "https://specs.apollo.dev/foo" requested to be merged has major version mismatch across subgraphs',
      ]
    ]);
  });

  it('different major versions of core feature results in error if composed. Different directives', () => {
    const subgraphA = generateSubgraph({
      name: 'subgraphA',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v1.0", import: ["@foo"])',
      composeText: '@composeDirective(name: "@foo")',
      directiveText: 'directive @foo(name: String!) on FIELD_DEFINITION',
      usage: '@foo(name: "a")',
    });
    const subgraphB = generateSubgraph({
      name: 'subgraphB',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v2.0", import: ["@bar"])',
      composeText: '@composeDirective(name: "@foo")',
      directiveText: 'directive @foo(name: String!) on FIELD_DEFINITION',
      usage: '@foo(name: "b")',
    });

    const result = composeServices([subgraphA, subgraphB]);
    expect(errors(result)).toStrictEqual([
      [
        'DIRECTIVE_COMPOSITION_ERROR',
        'Core feature "https://specs.apollo.dev/foo" requested to be merged has major version mismatch across subgraphs',
      ]
    ]);
  });

  it.each([
    '@tag', '@inaccessible',
  ])('federation directives that result in a hint', (directive) => {
    const subgraphA = generateSubgraph({
      name: 'subgraphA',
      composeText: `@composeDirective(name: "${directive}")`,
    });
    const subgraphB = generateSubgraph({
      name: 'subgraphB',
    });

    const result = composeServices([subgraphA, subgraphB]);
    expect(errors(result)).toStrictEqual([]);
    expect(hints(result)).toStrictEqual([
      [
        'DIRECTIVE_COMPOSITION_INFO',
        `Directive "${directive}" should not be explicitly manually composed since it is a federation directive composed by default`,
      ]
    ])
  });

  it.each([
    '@tag', '@inaccessible',
  ])('federation directives (with rename) that result in a hint', (directive) => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.1", import: [{ name: "@key" }, { name: "@composeDirective" } , { name: "${directive}", as: "@apolloDirective" }])
        @link(url: "https://specs.apollo.dev/link/v1.0")
        @composeDirective(name: "@apolloDirective")

        type Query {
          a: User
        }
        type User @key(fields: "id") {
          id: Int
          a: String
        }
      `,
    };
    const subgraphB = generateSubgraph({
      name: 'subgraphB',
    });

    const result = composeServices([subgraphA, subgraphB]);
    expect(errors(result)).toStrictEqual([]);
    expect(hints(result)).toStrictEqual([
      [
        'DIRECTIVE_COMPOSITION_INFO',
        `Directive "@apolloDirective" should not be explicitly manually composed since it is a federation directive composed by default`,
      ]
    ])
  });

  it.each([
    '@key', '@requires', '@provides', '@external', '@extends', '@shareable', '@override', '@composeDirective',
  ])('federation directives that result in an error', (directive) => {
    const subgraphA = generateSubgraph({
      name: 'subgraphA',
      composeText: `@composeDirective(name: "${directive}")`,
    });
    const subgraphB = generateSubgraph({
      name: 'subgraphB',
    });

    const result = composeServices([subgraphA, subgraphB]);
    expect(errors(result)).toStrictEqual([
      ['DIRECTIVE_COMPOSITION_ERROR', `Composing federation directive "${directive}" in subgraph "subgraphA" is not supported`],
    ]);
    expect(hints(result)).toStrictEqual([]);
  });

  it.each([
    '@requires', '@provides', '@external', '@extends', '@shareable', '@override',
  ])('federation directives (with rename) that result in an error', (directive) => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.1", import: [{ name: "@key" }, { name: "@composeDirective" } , { name: "${directive}", as: "@apolloDirective" }])
        @link(url: "https://specs.apollo.dev/link/v1.0")
        @composeDirective(name: "@apolloDirective")

        type Query {
          a: User
        }
        type User @key(fields: "id") {
          id: Int
          a: String
        }
      `,
    };
    const subgraphB = generateSubgraph({
      name: 'subgraphB',
    });

    const result = composeServices([subgraphA, subgraphB]);
    expect(errors(result)).toStrictEqual([
      ['DIRECTIVE_COMPOSITION_ERROR', `Composing federation directive "@apolloDirective" in subgraph "subgraphA" is not supported`],
    ]);
    expect(hints(result)).toStrictEqual([]);
  });

  it.each([
    '@join__field', '@join__graph', '@join__implements', '@join__type',
  ])('join spec directives should result in an error', (directive) => {
    const subgraphA = generateSubgraph({
      name: 'subgraphA',
      linkText: `@link(url: "https://specs.apollo.dev/join/v0.2", for: EXECUTION)`,
      composeText: `@composeDirective(name: "${directive}")`,
      directiveText: `
        directive @join__field(graph: join__Graph!, requires: join__FieldSet, provides: join__FieldSet, type: String, external: Boolean, override: String, usedOverridden: Boolean) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION
        directive @join__graph(name: String!, url: String!) on ENUM_VALUE
        directive @join__implements(graph: join__Graph!, interface: String!) repeatable on OBJECT | INTERFACE
        directive @join__type(graph: join__Graph!, key: join__FieldSet, extension: Boolean! = false, resolvable: Boolean! = true) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

        scalar join__FieldSet

        enum join__Graph {
          WORLD @join__graph(name: "world", url: "https://world.api.com.invalid")
        }
      `
    });
    const subgraphB = generateSubgraph({
      name: 'subgraphB',
    });

    const result = composeServices([subgraphA, subgraphB]);
    expect(errors(result)).toStrictEqual([
      ['DIRECTIVE_COMPOSITION_ERROR', `Composing federation directive "${directive}" in subgraph "subgraphA" is not supported`],
    ]);
    expect(hints(result)).toStrictEqual([]);
  });

  it('composing multiple versions of directive gets latest', () => {
    const subgraphA = generateSubgraph({
      name: 'subgraphA',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v1.0", import: ["@foo"])',
      composeText: '@composeDirective(name: "@foo")',
      directiveText: 'directive @foo(name: String!) on FIELD_DEFINITION',
      usage: '@foo(name: "a")',
    });
    const subgraphB = generateSubgraph({
      name: 'subgraphB',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v1.4", import: ["@foo"])',
      composeText: '@composeDirective(name: "@foo")',
      directiveText: 'directive @foo(name: String!, address: String) on FIELD_DEFINITION | OBJECT',
      usage: '@foo(name: "b")',
    });

    const result = composeServices([subgraphA, subgraphB]);
    expect(result.errors).toBeUndefined();
    expect(result.hints).toHaveLength(0);
    expect(result.schema).toBeDefined();

    // validate the directive looks right
    const directive = result.schema?.directive('foo');
    expect(directive?.locations).toEqual([DirectiveLocation.FIELD_DEFINITION, DirectiveLocation.OBJECT]);
    expect(directive?.arguments().map(arg => arg.name)).toEqual(['name', 'address']);

    // validate the @link looks right
    const feature = result.schema?.coreFeatures?.getByIdentity('https://specs.apollo.dev/foo');
    expect(feature?.url.toString()).toBe('https://specs.apollo.dev/foo/v1.4');
    expect(feature?.imports).toEqual([{ name: '@foo' }]);
  });

  it('composing multiple versions of directive gets latest one that is composed', () => {
    const subgraphA = generateSubgraph({
      name: 'subgraphA',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v1.0", import: ["@foo"])',
      composeText: '@composeDirective(name: "@foo")',
      directiveText: 'directive @foo(name: String!) on FIELD_DEFINITION',
      usage: '@foo(name: "a")',
    });
    const subgraphB = generateSubgraph({
      name: 'subgraphB',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v1.4", import: ["@foo"])',
      directiveText: 'directive @foo(name: String!, address: String) on FIELD_DEFINITION | OBJECT',
      usage: '@foo(name: "b")',
    });

    const result = composeServices([subgraphA, subgraphB]);
    const schema = expectNoErrors(result);
    expectDirectiveDefinition(schema, 'foo', [DirectiveLocation.FIELD_DEFINITION], ['name']);
    expectCoreFeature(schema, 'https://specs.apollo.dev/foo', '1.0', [{ name: '@foo' }]);
    expectDirectiveOnElement(schema, 'User.subgraphA', 'foo', { name: 'a' });
  });

  it('exported directive not imported everywhere. named consistently', () => {
    const subgraphA = generateSubgraph({
      name: 'subgraphA',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v1.0", import: ["@foo"])',
      composeText: '@composeDirective(name: "@foo")',
      directiveText: `
        directive @foo(name: String!) on FIELD_DEFINITION
        directive @bar(name: String!, address: String) on FIELD_DEFINITION | OBJECT
      `,
      usage: '@foo(name: "a")',
    });
    const subgraphB = generateSubgraph({
      name: 'subgraphB',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v1.1", import: ["@bar"])',
      composeText: '@composeDirective(name: "@bar")',
      directiveText: `
        directive @foo(name: String!) on FIELD_DEFINITION
        directive @bar(name: String!, address: String) on FIELD_DEFINITION | OBJECT
      `,
      usage: '@bar(name: "b")',
    });

    const result = composeServices([subgraphA, subgraphB]);
    const schema = expectNoErrors(result);
    expectDirectiveDefinition(schema, 'foo', [DirectiveLocation.FIELD_DEFINITION], ['name']);
    expectDirectiveDefinition(schema, 'bar',
      [DirectiveLocation.FIELD_DEFINITION, DirectiveLocation.OBJECT],
      ['name', 'address'],
    );
    expectCoreFeature(schema, 'https://specs.apollo.dev/foo', '1.1', [{ name: '@foo' }, { name: '@bar' }]);
    expectDirectiveOnElement(schema, 'User.subgraphA', 'foo', { name: 'a' });
    expectDirectiveOnElement(schema, 'User.subgraphB', 'bar', { name: 'b' });
  });

  it('exported directive not imported everywhere. not imported.', () => {
    const subgraphA = generateSubgraph({
      name: 'subgraphA',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v1.1", import: ["@foo"])',
      composeText: '@composeDirective(name: "@foo")',
      directiveText: `
        directive @foo(name: String!) on FIELD_DEFINITION
        directive @foo__bar(name: String!, address: String) on FIELD_DEFINITION | OBJECT
      `,
      usage: '@foo(name: "a")',
    });
    const subgraphB = generateSubgraph({
      name: 'subgraphB',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v1.0", import: ["@bar"])',
      composeText: '@composeDirective(name: "@bar")',
      directiveText: `
        directive @foo(name: String!) on FIELD_DEFINITION
        directive @bar(name: String!, address: String) on FIELD_DEFINITION | OBJECT
      `,
      usage: '@bar(name: "b")',
    });

    const result = composeServices([subgraphA, subgraphB]);
    const schema = expectNoErrors(result);
    expectDirectiveDefinition(schema, 'foo', [DirectiveLocation.FIELD_DEFINITION], ['name']);
    expectDirectiveDefinition(schema, 'bar', [DirectiveLocation.FIELD_DEFINITION, DirectiveLocation.OBJECT], ['name', 'address']);
    expectCoreFeature(schema, 'https://specs.apollo.dev/foo', '1.1', [{ name: '@foo' }, { name: '@bar' }]);
    expectDirectiveOnElement(schema, 'User.subgraphA', 'foo', { name: 'a' });
    expectDirectiveOnElement(schema, 'User.subgraphB', 'bar', { name: 'b' });
  });

  it('exported directive not imported everywhere. imported with different name', () => {
    const subgraphA = generateSubgraph({
      name: 'subgraphA',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v1.1", import: ["@foo", { name: "@bar", as: "@baz" }])',
      composeText: '@composeDirective(name: "@foo")',
      directiveText: `
        directive @foo(name: String!) on FIELD_DEFINITION
        directive @baz(name: String!, address: String) on FIELD_DEFINITION | OBJECT
      `,
      usage: '@foo(name: "a")',
    });
    const subgraphB = generateSubgraph({
      name: 'subgraphB',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v1.0", import: ["@bar"])',
      composeText: '@composeDirective(name: "@bar")',
      directiveText: `
        directive @foo(name: String!) on FIELD_DEFINITION
        directive @bar(name: String!, address: String) on FIELD_DEFINITION | OBJECT
      `,
      usage: '@bar(name: "b")',
    });

    const result = composeServices([subgraphA, subgraphB]);
    const schema = expectNoErrors(result, [
      ['DIRECTIVE_COMPOSITION_WARN', `Composed directive "@bar" is named differently in a subgraph that doesn't export it. Consistent naming will be required to export it.`],
    ]);
    expectDirectiveDefinition(schema, 'foo', [DirectiveLocation.FIELD_DEFINITION], ['name']);
    expectDirectiveDefinition(schema, 'bar', [DirectiveLocation.FIELD_DEFINITION, DirectiveLocation.OBJECT], ['name', 'address']);
    expectCoreFeature(schema, 'https://specs.apollo.dev/foo', '1.1', [{ name: '@foo' }, { name: '@bar' }]);
    expectDirectiveOnElement(schema, 'User.subgraphA', 'foo', { name: 'a' });
    expectDirectiveOnElement(schema, 'User.subgraphB', 'bar', { name: 'b' });
  });

  it('exported directive not imported everywhere. no definition', () => {
    const subgraphA = generateSubgraph({
      name: 'subgraphA',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v1.1", import: ["@foo"])',
      composeText: '@composeDirective(name: "@foo")',
      directiveText: `
        directive @foo(name: String!) on FIELD_DEFINITION
      `,
      usage: '@foo(name: "a")',
    });
    const subgraphB = generateSubgraph({
      name: 'subgraphB',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v1.0", import: ["@bar"])',
      composeText: '@composeDirective(name: "@bar")',
      directiveText: `
        directive @foo(name: String!) on FIELD_DEFINITION
        directive @bar(name: String!, address: String) on FIELD_DEFINITION | OBJECT
      `,
      usage: '@bar(name: "b")',
    });

    const result = composeServices([subgraphA, subgraphB]);
    expect(errors(result)).toStrictEqual([
      [
      'DIRECTIVE_COMPOSITION_ERROR',
      'Core feature "https://specs.apollo.dev/foo" in subgraph "subgraphA" does not have a directive definition for "@bar"',
      ]
    ]);
    expect(hints(result)).toStrictEqual([]);
  });

  it.todo('composing same major version, but incompatible directives results in error');

  it('composing custom directive not in a core feature results in raised hint', () => {
    const subgraphA = generateSubgraph({
      name: 'subgraphA',
      composeText: '@composeDirective(name: "@foo")',
      directiveText: 'directive @foo(name: String!) on FIELD_DEFINITION',
      usage: '@foo(name: "a")',
    });
    const subgraphB = generateSubgraph({
      name: 'subgraphB',
    });

    const result = composeServices([subgraphA, subgraphB]);
    const schema = expectNoErrors(result, [
      ['DIRECTIVE_COMPOSITION_INFO', 'Directive "@foo" in subgraph "subgraphA" cannot be composed because it is not a member of a core feature'],
    ]);

    // validate the directive is not composed
    const directive = schema.directive('foo');
    expect(directive).toBeUndefined();

    // validate the @link is not present
    const feature = schema.coreFeatures?.getByIdentity('https://specs.apollo.dev/foo');
    expect(feature).toBeUndefined();
  });

  it('composing custom directive with different names in different subgraphs results in error', () => {
    const subgraphA = generateSubgraph({
      name: 'subgraphA',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v1.0", import: ["@foo"])',
      composeText: '@composeDirective(name: "@foo")',
      directiveText: 'directive @foo(name: String!) on FIELD_DEFINITION',
      usage: '@foo(name: "a")',
    });
    const subgraphB = generateSubgraph({
      name: 'subgraphB',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v1.0", import: [{ name: "@foo", as: "@bar" }])',
      composeText: '@composeDirective(name: "@bar")',
      directiveText: 'directive @bar(name: String!) on FIELD_DEFINITION',
      usage: '@bar(name: "a")',
    });

    const result = composeServices([subgraphA, subgraphB]);
    expect(errors(result)).toStrictEqual([
      ['DIRECTIVE_COMPOSITION_ERROR', 'Composed directive is not named consistently in all subgraphs but "@foo" in subgraph "subgraphA" and "@bar" in subgraph "subgraphB"'],
    ]);
  });

  it('core directive named differently in different subgraphs results in hint if only one composed', () => {
    const subgraphA = generateSubgraph({
      name: 'subgraphA',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v1.0", import: ["@foo"])',
      composeText: '@composeDirective(name: "@foo")',
      directiveText: 'directive @foo(name: String!) on FIELD_DEFINITION',
      usage: '@foo(name: "a")',
    });
    const subgraphB = generateSubgraph({
      name: 'subgraphB',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v1.0", import: [{ name: "@foo", as: "@bar" }])',
      directiveText: 'directive @bar(name: String!) on FIELD_DEFINITION',
      usage: '@bar(name: "a")',
    });

    const result = composeServices([subgraphA, subgraphB]);
    expect(errors(result)).toEqual([]);
    expect(hints(result)).toStrictEqual([
      ['DIRECTIVE_COMPOSITION_WARN', `Composed directive "@foo" is named differently in a subgraph that doesn't export it. Consistent naming will be required to export it.`],
    ]);
  });

  it('composed directive must be linked to the same core feature', () => {
    const subgraphA = generateSubgraph({
      name: 'subgraphA',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v1.0", import: ["@foo"])',
      composeText: '@composeDirective(name: "@foo")',
      directiveText: 'directive @foo(name: String!) on FIELD_DEFINITION',
      usage: '@foo(name: "a")',
    });
    const subgraphB = generateSubgraph({
      name: 'subgraphB',
      linkText: '@link(url: "https://specs.apollo.dev/bar/v1.0", import: ["@foo"])',
      composeText: '@composeDirective(name: "@foo")',
      directiveText: 'directive @foo(name: String!) on FIELD_DEFINITION',
      usage: '@foo(name: "a")',
    });

    const result = composeServices([subgraphA, subgraphB]);
    expect(hints(result)).toEqual([]);
    expect(errors(result)).toStrictEqual([
      ['DIRECTIVE_COMPOSITION_ERROR', `Composed directive "@foo" is not linked by the same core feature in every subgraph`],
    ]);
  });

  it('composed directive must be the same original directive in all subgraphs', () => {
    const subgraphA = generateSubgraph({
      name: 'subgraphA',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v1.0", import: ["@foo"])',
      composeText: '@composeDirective(name: "@foo")',
      directiveText: 'directive @foo(name: String!) on FIELD_DEFINITION',
      usage: '@foo(name: "a")',
    });
    const subgraphB = generateSubgraph({
      name: 'subgraphB',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v1.0", import: [{ name: "@bar", as: "@foo" }])',
      composeText: '@composeDirective(name: "@foo")',
      directiveText: 'directive @foo(name: String!) on FIELD_DEFINITION',
      usage: '@foo(name: "a")',
    });

    const result = composeServices([subgraphA, subgraphB]);
    expect(hints(result)).toEqual([]);
    expect(errors(result)).toStrictEqual([
      ['DIRECTIVE_COMPOSITION_ERROR', `Composed directive "@foo" does not refer to the same directive in every subgraph`],
    ]);
  });

  it.skip('directive may not be named as to cause a naming conflict with federation directives', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.1", import: ["@key", "@composeDirective"])
        @link(url: "https://specs.apollo.dev/link/v1.0")
        @link(url: "https://specs.apollo.dev/foo/v1.0", import: [{ name: "@foo", as: "@inaccessible" }])
        @composeDirective(name: "@inaccessible")

        directive @inaccessible(name: String!) on FIELD_DEFINITION
        type Query {
          a: User
        }
        type User @key(fields: "id") {
          id: Int
          a: String @inaccessible(name: "a")
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.1", import: ["@key", "@composeDirective", "@inaccessible"])
        @link(url: "https://specs.apollo.dev/link/v1.0")

        type Query {
          b: User
        }
        type User @key(fields: "id") {
          id: Int
          b: String @inaccessible
        }
      `,
    };

    const result = composeServices([subgraphA, subgraphB]);
    expect(errors(result)).toStrictEqual([
      [
        'DIRECTIVE_COMPOSITION_ERROR',
        '',
      ]
    ]);
  });

  it('ensure that composeDirective argument must start with an @', () => {
    const subgraphA = generateSubgraph({
      name: 'subgraphA',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v1.0", import: ["@foo"])',
      composeText: '@composeDirective(name: "foo")',
      directiveText: 'directive @foo(name: String!) on FIELD_DEFINITION',
      usage: '@foo(name: "a")',
    });
    const subgraphB = generateSubgraph({
      name: 'subgraphB',
    });

    const result = composeServices([subgraphA, subgraphB]);
    expect(errors(result)).toStrictEqual([
      [
        'DIRECTIVE_COMPOSITION_ERROR',
        'Argument to @composeDirective "foo" in subgraph "subgraphA" must have a leading "@"',
      ]
    ]);
  });

  it('ensure that composeDirective target must exist in the subgraph, validate didYouMean', () => {
    const subgraphA = generateSubgraph({
      name: 'subgraphA',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v1.0", import: ["@foo"])',
      composeText: '@composeDirective(name: "@fooz")',
      directiveText: 'directive @foo(name: String!) on FIELD_DEFINITION',
      usage: '@foo(name: "a")',
    });
    const subgraphB = generateSubgraph({
      name: 'subgraphB',
    });

    const result = composeServices([subgraphA, subgraphB]);
    expect(errors(result)).toStrictEqual([
      [
        'DIRECTIVE_COMPOSITION_ERROR',
        'Could not find matching directive definition for argument to @composeDirective "@fooz" in subgraph "subgraphA". Did you mean "@foo"?',
      ]
    ]);
  });

  it('ensure that composeDirective target must exist in the subgraph, use as name', () => {
    const subgraphA = generateSubgraph({
      name: 'subgraphA',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v1.0", import: [{ name: "@foo", as: "@bar" }])',
      composeText: '@composeDirective(name: "@barz")',
      directiveText: 'directive @bar(name: String!) on FIELD_DEFINITION',
      usage: '@bar(name: "a")',
    });
    const subgraphB = generateSubgraph({
      name: 'subgraphB',
    });

    const result = composeServices([subgraphA, subgraphB]);
    expect(errors(result)).toStrictEqual([
      [
        'DIRECTIVE_COMPOSITION_ERROR',
        'Could not find matching directive definition for argument to @composeDirective "@barz" in subgraph "subgraphA". Did you mean "@bar" or "@tag"?',
      ]
    ]);
  });

  it('custom tag directive works when renamed', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.1", import: ["@key", "@composeDirective", "@tag"])
        @link(url: "https://specs.apollo.dev/link/v1.0")
        @link(url: "https://custom.dev/tag/v1.0", import: [{ name: "@tag", as: "@mytag"}])
        @composeDirective(name: "@mytag")

        directive @mytag(name: String!, prop: String!) on FIELD_DEFINITION | OBJECT
        type Query {
          a: User
        }
        type User @key(fields: "id") {
          id: Int
          a: String @mytag(name: "a", prop: "b")
          b: String @tag(name: "c")
        }
      `,
    };

    const subgraphB = generateSubgraph({
      name: 'subgraphB',
    });

    const result = composeServices([subgraphA, subgraphB]);
    const schema = expectNoErrors(result);
    expectDirectiveDefinition(
      schema,
      'tag',
      [
        DirectiveLocation.FIELD_DEFINITION,
        DirectiveLocation.OBJECT,
        DirectiveLocation.INTERFACE,
        DirectiveLocation.UNION,
        DirectiveLocation.ARGUMENT_DEFINITION,
        DirectiveLocation.SCALAR,
        DirectiveLocation.ENUM,
        DirectiveLocation.ENUM_VALUE,
        DirectiveLocation.INPUT_OBJECT,
        DirectiveLocation.INPUT_FIELD_DEFINITION,
      ], ['name']);

    expectDirectiveDefinition(schema, 'mytag', [DirectiveLocation.FIELD_DEFINITION, DirectiveLocation.OBJECT], ['name', 'prop']);

    // validate the directive looks right
    const mytag = result.schema?.directive('mytag');
    expect(mytag?.locations).toEqual([DirectiveLocation.FIELD_DEFINITION, DirectiveLocation.OBJECT]);
    expect(mytag?.arguments().map(tag => tag.name)).toEqual(['name', 'prop']);

    // validate that the properties have the right tags
    expectDirectiveOnElement(schema, 'User.a', 'mytag', { name: 'a', prop: 'b' });
    expectDirectiveOnElement(schema, 'User.b', 'tag', { name: 'c' });

    expectCoreFeature(schema, 'https://custom.dev/tag', '1.0', [{ name: '@tag', as: '@mytag' }]);
  });

  it.skip('custom tag directive works when federation tag is renamed', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.1", import: ["@key", "@composeDirective", {name: "@tag", as: "@mytag"}])
        @link(url: "https://specs.apollo.dev/link/v1.0")
        @link(url: "https://custom.dev/tag/v1.0", import: ["@tag"])
        @composeDirective(name: "@tag")

        directive @tag(name: String!, prop: String!) on FIELD_DEFINITION | OBJECT
        type Query {
          a: User
        }
        type User @key(fields: "id") {
          id: Int
          a: String @tag(name: "a", prop: "b")
          b: String @mytag(name: "c")
        }
      `,
    };

    const subgraphB = generateSubgraph({
      name: 'subgraphB',
    });

    const result = composeServices([subgraphA, subgraphB]);
    expect(errors(result)).toStrictEqual([]);
    expect(hints(result)).toStrictEqual([]);
    expect(result.schema).toBeDefined();

    // validate the directive looks right
    const mytag = result.schema?.directive('mytag');
    expect(mytag?.locations).toEqual([
      DirectiveLocation.FIELD_DEFINITION,
      DirectiveLocation.OBJECT,
      DirectiveLocation.INTERFACE,
      DirectiveLocation.UNION,
      DirectiveLocation.ARGUMENT_DEFINITION,
      DirectiveLocation.SCALAR,
      DirectiveLocation.ENUM,
      DirectiveLocation.ENUM_VALUE,
      DirectiveLocation.INPUT_OBJECT,
      DirectiveLocation.INPUT_FIELD_DEFINITION,
    ]);
    expect(mytag?.arguments().map(tag => tag.name)).toEqual(['name']);

    // validate the directive looks right
    const tag = result.schema?.directive('tag');
    expect(tag?.locations).toEqual([DirectiveLocation.FIELD_DEFINITION, DirectiveLocation.OBJECT]);
    expect(tag?.arguments().map(tag => tag.name)).toEqual(['name', 'prop']);

    // validate that the properties have the right tags


    // validate the @link looks right
    const feature = result.schema?.coreFeatures?.getByIdentity('https://custom.dev/tag');
    expect(feature?.url.toString()).toBe('https://custom.dev/tag/v1.0');
    expect(feature?.imports).toEqual([{ name: '@tag' }]);
  });
});
