import fs from 'fs';
import {
  GraphQLDirective,
  GraphQLNamedType,
  GraphQLSchema,
  parse,
} from 'graphql';
import path from 'path';
import { buildComposedSchema } from '..';

describe('buildComposedSchema', () => {
  let schema: GraphQLSchema;

  beforeAll(() => {
    const schemaPath = path.join(
      __dirname,
      '../../__tests__/features/basic/',
      'supergraphSdl.graphql',
    );
    const supergraphSdl = fs.readFileSync(schemaPath, 'utf8');

    schema = buildComposedSchema(parse(supergraphSdl));
  });

  it(`doesn't include core directives`, () => {
    const directives = schema
      .getDirectives()
      .filter((directive) => isAssociatedWithFeature(directive, 'core'));
    expect(directives).toEqual([]);
  });

  it(`doesn't include core types`, () => {
    const types = Object.values(schema.getTypeMap()).filter((type) =>
      isAssociatedWithFeature(type, 'core'),
    );
    expect(types).toEqual([]);
  });

  it(`doesn't include join directives`, () => {
    const directives = schema
      .getDirectives()
      .filter((directive) => isAssociatedWithFeature(directive, 'join'));
    expect(directives).toEqual([]);
  });

  it(`doesn't include join types`, () => {
    const types = Object.values(schema.getTypeMap()).filter((type) =>
      isAssociatedWithFeature(type, 'join'),
    );
    expect(types).toEqual([]);
  });

  it(`does pass through other custom directives`, () => {
    expect(schema.getDirectives()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'transform' }),
        expect.objectContaining({ name: 'stream' }),
      ]),
    );
  });
});

type NamedSchemaElement = GraphQLDirective | GraphQLNamedType;

function isAssociatedWithFeature(
  element: NamedSchemaElement,
  featureName: string,
) {
  return (
    element.name === `${featureName}` ||
    element.name.startsWith(`${featureName}__`)
  );
}
