import {
  ARGUMENT_COMPOSITION_STRATEGIES,
  CorePurpose,
  createDirectiveSpecification,
  Directive,
  DirectiveSpecification,
  FeatureDefinition,
  FeatureDefinitions,
  FeatureUrl,
  FeatureVersion,
  ListType,
  NonNullType,
  ObjectType,
  Schema,
  valueToString
} from "@apollo/federation-internals";
import { DirectiveLocation } from "graphql";
import gql from "graphql-tag";
import { assertCompositionSuccess, composeAsFed2Subgraphs } from "./testHelper";
import {
  registerKnownFeature,
  unregisterKnownFeatures,
} from "@apollo/federation-internals/dist/knownCoreFeatures"
import { HINTS } from "../hints";

let testFeature: FeatureDefinitions | undefined = undefined;

function createTestFeature({
  url,
  name,
  createDirective,
  purpose,
}: {
  url: string,
  name: string,
  createDirective: (name: string, spec: () => FeatureDefinition) => DirectiveSpecification,
  purpose?: CorePurpose,
}) {
  class TestSpecDefinition extends FeatureDefinition {
    constructor(version: FeatureVersion) {
      super(FeatureUrl.parse(`${url}/${name}/${version}`));
      this.registerDirective(createDirective(name, () => testFeature!.latest()));
    }

    get defaultCorePurpose(): CorePurpose | undefined {
      return purpose;
    }
  }

  testFeature = new FeatureDefinitions<TestSpecDefinition>(`${url}/${name}`)
    .add(new TestSpecDefinition(new FeatureVersion(0, 1)));

  registerKnownFeature(testFeature);
}

function directiveStrings(elt: { appliedDirectives: readonly Directive<any>[] }, contains?: string): string[] {
  const strings = elt.appliedDirectives.map((d) => d.toString());
  return contains ? strings.filter((str) => str.includes(contains)) : strings;
}

describe('composition of directive with non-trivial argument strategies', () => {
  afterEach(() => {
    if (testFeature) {
      unregisterKnownFeatures(testFeature);
      testFeature = undefined;
    }
  });

  test.each([{
    name: 'max',
    type: (schema: Schema) => new NonNullType(schema.intType()),
    compositionStrategy: ARGUMENT_COMPOSITION_STRATEGIES.MAX,
    argValues: {
      s1: { t: 3, k: 1 },
      s2: { t: 2, k: 5, b: 4 },
    },
    resultValues: {
      t: 3, k: 5, b: 4,
    },
  }, {
    name: 'min',
    type: (schema: Schema) => new NonNullType(schema.intType()),
    compositionStrategy: ARGUMENT_COMPOSITION_STRATEGIES.MIN,
    argValues: {
      s1: { t: 3, k: 1 },
      s2: { t: 2, k: 5, b: 4 },
    },
    resultValues: {
      t: 2, k: 1, b: 4,
    },
  }, {
    name: 'sum',
    type: (schema: Schema) => new NonNullType(schema.intType()),
    compositionStrategy: ARGUMENT_COMPOSITION_STRATEGIES.SUM,
    argValues: {
      s1: { t: 3, k: 1 },
      s2: { t: 2, k: 5, b: 4 },
    },
    resultValues: {
      t: 5, k: 6, b: 4,
    },
  }, {
    name: 'intersection',
    type: (schema: Schema) => new NonNullType(new ListType(new NonNullType(schema.stringType()))),
    compositionStrategy: ARGUMENT_COMPOSITION_STRATEGIES.INTERSECTION,
    argValues: {
      s1: { t: ['foo', 'bar'], k: [] },
      s2: { t: ['foo'], k: ['v1', 'v2'], b: ['x'] },
    },
    resultValues: {
      t: ['foo'], k: [], b: ['x'],
    },
  }, {
    name: 'union',
    type: (schema: Schema) => new NonNullType(new ListType(new NonNullType(schema.stringType()))),
    compositionStrategy: ARGUMENT_COMPOSITION_STRATEGIES.UNION,
    argValues: {
      s1: { t: ['foo', 'bar'], k: [] },
      s2: { t: ['foo'], k: ['v1', 'v2'], b: ['x'] },
    },
    resultValues: {
      t: ['foo', 'bar'], k: ['v1', 'v2'], b: ['x'],
    },
  },
  {
    name: 'nullable_and',
    type: (schema: Schema) => schema.booleanType(),
    compositionStrategy: ARGUMENT_COMPOSITION_STRATEGIES.NULLABLE_AND,
    argValues: {
      s1: { t: true, k: true },
      s2: { t: undefined, k: false, b: false },
    },
    resultValues: {
      t: true, k: false, b: false,
    },
  },
  {
    name: 'nullable_max',
    type: (schema: Schema) => schema.intType(),
    compositionStrategy: ARGUMENT_COMPOSITION_STRATEGIES.NULLABLE_MAX,
    argValues: {
      s1: { t: 3, k: 1 },
      s2: { t: 2, k: undefined, b: undefined },
    },
    resultValues: {
      t: 3, k: 1, b: undefined,
    },
  },
  {
    name: 'nullable_union',
    type: (schema: Schema) => new ListType(new NonNullType(schema.stringType())),
    compositionStrategy: ARGUMENT_COMPOSITION_STRATEGIES.NULLABLE_UNION,
    argValues: {
      s1: { t: ['foo', 'bar'], k: [] },
      s2: { t: ['foo'], k: ['v1', 'v2'], b: ['x'] },
    },
    resultValues: {
      t: ['foo', 'bar'], k: ['v1', 'v2'], b: ['x'],
    },
  }])('works for $name', ({ name, type, compositionStrategy, argValues, resultValues }) => {
    createTestFeature({
      url: 'https://specs.apollo.dev',
      name,
      createDirective: (name, supergraphSpecification) => createDirectiveSpecification({
        name,
        locations: [DirectiveLocation.OBJECT, DirectiveLocation.FIELD_DEFINITION],
        composes: true,
        supergraphSpecification,
        args: [
          { name: "value", type, compositionStrategy }
        ],
      }),
    });

    const subgraph1 = {
      name: 'Subgraph1',
      url: 'https://Subgraph1',
      typeDefs: gql`
        extend schema @link(url: "https://specs.apollo.dev/${name}/v0.1")

        type Query {
          t: T
        }

        type T
          @key(fields: "k")
          @${name}(value: ${valueToString(argValues.s1.t)})
        {
          k: ID @${name}(value: ${valueToString(argValues.s1.k)})
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      url: 'https://Subgraph2',
      typeDefs: gql`
        extend schema @link(url: "https://specs.apollo.dev/${name}/v0.1")

        type T
          @key(fields: "k")
          @${name}(value: ${valueToString(argValues.s2.t)})
      {
          k: ID @${name}(value: ${valueToString(argValues.s2.k)})
          a: Int
          b: String @${name}(value: ${valueToString(argValues.s2.b)})
        }
      `
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);

    expect(result.hints.map((h) => [h.definition, h.message])).toStrictEqual([
      [HINTS.MERGED_NON_REPEATABLE_DIRECTIVE_ARGUMENTS, `Directive @${name} is applied to "T" in multiple subgraphs with different arguments. Merging strategies used by arguments: { "value": ${compositionStrategy.name} }`],
      [HINTS.MERGED_NON_REPEATABLE_DIRECTIVE_ARGUMENTS, `Directive @${name} is applied to "T.k" in multiple subgraphs with different arguments. Merging strategies used by arguments: { "value": ${compositionStrategy.name} }`],
    ]);

    const s = result.schema;

    expect(directiveStrings(s.schemaDefinition, name)).toStrictEqual([
      `@link(url: "https://specs.apollo.dev/${name}/v0.1")`
    ]);

    const t = s.type('T') as ObjectType;
    expect(directiveStrings(t, name)).toStrictEqual([`@${name}(value: ${valueToString(resultValues.t)})`]);

    expect(directiveStrings(t.field('k')!, name)).toStrictEqual([`@${name}(value: ${valueToString(resultValues.k)})`]);
    expect(directiveStrings(t.field('b')!, name)).toStrictEqual([`@${name}(value: ${valueToString(resultValues.b)})`]);

  });

  test('errors when declaring strategy that does not match the argument type', () => {
    const name = 'foo';
    const value = "bar";

    createTestFeature({
      url: 'https://specs.apollo.dev',
      name,
      createDirective: (name, supergraphSpecification) => createDirectiveSpecification({
        name,
        locations: [DirectiveLocation.OBJECT, DirectiveLocation.FIELD_DEFINITION],
        composes: true,
        supergraphSpecification,
        args: [
          { name: "value", type: (schema) => schema.stringType(), compositionStrategy: ARGUMENT_COMPOSITION_STRATEGIES.MAX }
        ],
      }),
    });

    const subgraph1 = {
      name: 'Subgraph1',
      url: 'https://Subgraph1',
      typeDefs: gql`
        extend schema @link(url: "https://specs.apollo.dev/${name}/v0.1")

        type Query {
          t: T
        }

        type T {
          v: String @${name}(value: ${valueToString(value)})
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      url: 'https://Subgraph2',
      typeDefs: gql`
        extend schema @link(url: "https://specs.apollo.dev/${name}/v0.1")

        type T {
          v: String @${name}(value: ${valueToString(value)})
        }
      `
    };

    expect(
      () => composeAsFed2Subgraphs([subgraph1, subgraph2])
    ).toThrow('Invalid composition strategy MAX for argument @foo(value:) of type String; MAX only supports type(s) Int!');
  });
});
