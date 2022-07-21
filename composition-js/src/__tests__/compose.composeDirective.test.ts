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
      @link(url: "https://specs.apollo.dev/federation/v2.1", import: ["@key", "@requires", "@provides", "@external", "@tag", "@extends", "@shareable", "@inaccessible", "@override", "@composeDirective"])
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
    expect(result.errors).toBeUndefined();
    expect(result.hints).toHaveLength(0);
    expect(result.schema).toBeDefined();

    // validate the directive looks right
    const directive = result.schema?.directive('foo');
    expect(directive?.locations).toEqual([DirectiveLocation.FIELD_DEFINITION]);
    expect(directive?.arguments().map(arg => arg.name)).toEqual(['name']);

    // validate the @link looks right
    const feature = result.schema?.coreFeatures?.getByIdentity('https://specs.apollo.dev/foo');
    expect(feature?.url.toString()).toBe('https://specs.apollo.dev/foo/v1.0');
    expect(feature?.imports).toEqual([{ name: '@foo' }]);
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
      ['CORE_DIRECTIVE_MERGE_INFO', 'Non-composed core feature "https://specs.apollo.dev/foo" has major version mismatch'],
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
      ['CORE_DIRECTIVE_MERGE_INFO', 'Non-composed core feature "https://specs.apollo.dev/foo" has major version mismatch'],
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
        'CORE_DIRECTIVE_MERGE_ERROR',
        'Core feature "https://specs.apollo.dev/foo" requested to be merged has major version mismatch across subgraphs',
      ]
    ]);
  });

  it.each([
    '@key', '@requires', '@provides', '@external', '@tag', '@extends', '@inaccessible', '@shareable', '@override', '@composeDirective',
  ])('not possible to explicitly compose federation directives', (directive) => {
    const subgraphA = generateSubgraph({
      name: 'subgraphA',
      composeText: `@composeDirective(name: "${directive}")`,
    });
    const subgraphB = generateSubgraph({
      name: 'subgraphB',
    });

    const result = composeServices([subgraphA, subgraphB]);
    expect(hints(result)).toStrictEqual([
      [
        'CORE_DIRECTIVE_MERGE_INFO',
        `Directive "${directive}" should not be explicitly manually composed since its composition rules are done automatically by federation`,
      ]
    ])
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
    expect(result.errors).toBeUndefined();
    expect(result.hints).toHaveLength(0);
    expect(result.schema).toBeDefined();

    // validate the directive looks right
    const directive = result.schema?.directive('foo');
    expect(directive?.locations).toEqual([DirectiveLocation.FIELD_DEFINITION]);
    expect(directive?.arguments().map(arg => arg.name)).toEqual(['name']);

    // validate the @link looks right
    const feature = result.schema?.coreFeatures?.getByIdentity('https://specs.apollo.dev/foo');
    expect(feature?.url.toString()).toBe('https://specs.apollo.dev/foo/v1.0');
    expect(feature?.imports).toEqual([{ name: '@foo' }]);
  });

  it.skip('composing multiple versions of directive has imports for all directives', () => {
    const subgraphA = generateSubgraph({
      name: 'subgraphA',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v1.0", import: ["@foo"])',
      composeText: '@composeDirective(name: "@foo")',
      directiveText: 'directive @foo(name: String!) on FIELD_DEFINITION',
      usage: '@foo(name: "a")',
    });
    const subgraphB = generateSubgraph({
      name: 'subgraphB',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v1.0", import: ["@bar"])',
      composeText: '@composeDirective(name: "@bar")',
      directiveText: 'directive @bar(name: String!, address: String) on FIELD_DEFINITION | OBJECT',
      usage: '@bar(name: "b")',
    });

    const result = composeServices([subgraphA, subgraphB]);
    expect(result.errors).toBeUndefined();
    expect(result.hints).toHaveLength(0);
    expect(result.schema).toBeDefined();

    // validate the directive looks right
    const foo = result.schema?.directive('foo');
    expect(foo?.locations).toEqual([DirectiveLocation.FIELD_DEFINITION]);
    expect(foo?.arguments().map(arg => arg.name)).toEqual(['name']);

    // validate the directive looks right
    const bar = result.schema?.directive('bar');
    expect(bar?.locations).toEqual([DirectiveLocation.FIELD_DEFINITION, DirectiveLocation.OBJECT]);
    expect(bar?.arguments().map(arg => arg.name)).toEqual(['name', 'address']);

    // validate the @link looks right
    const feature = result.schema?.coreFeatures?.getByIdentity('https://specs.apollo.dev/foo');
    expect(feature?.url.toString()).toBe('https://specs.apollo.dev/foo/v1.0');
    expect(feature?.imports).toEqual([{ name: '@foo' }, { name: '@bar' }]);
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
    expect(hints(result)).toStrictEqual([
      ['CORE_DIRECTIVE_MERGE_INFO', 'Directive "@foo" in subgraph "subgraphA" cannot be composed because it is not a member of a core feature'],
    ]);
    expect(result.schema).toBeDefined();

    // validate the directive looks right
    const directive = result.schema?.directive('foo');
    expect(directive).toBeUndefined();

    // validate the @link looks right
    const feature = result.schema?.coreFeatures?.getByIdentity('https://specs.apollo.dev/foo');
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
      ['CORE_DIRECTIVE_MERGE_ERROR', 'Composed directive "@foo" named inconsistently (subgraph, directiveName). ("subgraphA","@foo"),("subgraphB","@bar")'],
    ]);
  });

  it.skip('core directive named differently in different subgraphs results in hint if not composed', () => {
    const subgraphA = generateSubgraph({
      name: 'subgraphA',
      linkText: '@link(url: "https://specs.apollo.dev/foo/v1.0", import: ["@foo"])',
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
      ['CORE_DIRECTIVE_MERGE_INFO', 'Composed directive "@foo" named inconsistently (subgraph, directiveName). ("subgraphA","@foo"),("subgraphB","@bar")'],
    ]);
  });

  it.skip('core directive named differently in different subgraphs results in hint if only one composed', () => {
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
      ['CORE_DIRECTIVE_MERGE_INFO', 'Composed directive "@foo" named inconsistently (subgraph, directiveName). ("subgraphA","@foo"),("subgraphB","@bar")'],
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
        'CORE_DIRECTIVE_MERGE_ERROR',
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
        'CORE_DIRECTIVE_MERGE_ERROR',
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
        'CORE_DIRECTIVE_MERGE_ERROR',
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
        'CORE_DIRECTIVE_MERGE_ERROR',
        'Could not find matching directive definition for argument to @composeDirective "@barz" in subgraph "subgraphA". Did you mean "@bar" or "@tag"?',
      ]
    ]);
  });
});
