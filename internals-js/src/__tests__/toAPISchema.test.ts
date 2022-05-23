import fs from 'fs';
import { Schema } from '../definitions';
import { buildSchema } from '../buildSchema';
import path from 'path';

function directiveNames(schema: Schema): string[] {
  return [...schema.allDirectives()].map((directive) => directive.name);
}

function typeNames(schema: Schema): string[] {
  return [...schema.allTypes()].map((type) => type.name);
}

describe('toAPISchema', () => {
  let schema: Schema;

  beforeAll(() => {
    const schemaPath = path.join(
      __dirname,
      'supergraphSdl.graphql',
    );
    const supergraphSdl = fs.readFileSync(schemaPath, 'utf8');

    schema = buildSchema(supergraphSdl).toAPISchema({ exposeDirectives: ['@transform', '@stream']});
  });

  it(`doesn't include core directives`, () => {
    expect(directiveNames(schema)).toEqual(expect.not.arrayContaining(['core']));
  });

  it(`doesn't include join directives`, () => {
    expect(directiveNames(schema)).toEqual(
      expect.not.arrayContaining([
        'join__graph',
        'join__type',
        'join__owner',
        'join__field',
      ]),
    );
  });

  it(`doesn't include join types`, () => {
    expect(typeNames(schema)).toEqual(
      expect.not.arrayContaining(['join__FieldSet', 'join__Graph']),
    );
  });

  it(`does pass through other custom directives`, () => {
    expect(directiveNames(schema)).toEqual(
      expect.arrayContaining([ 'transform', 'stream' ]),
    );
  });
});

describe('toAPISchema - returns cached version?', () => {
  let schema: Schema;
  let lastApiSchema: Schema;
  beforeAll(() => {
    const schemaPath = path.join(
      __dirname,
      'supergraphSdl.graphql',
    );
    const supergraphSdl = fs.readFileSync(schemaPath, 'utf8');

    schema = buildSchema(supergraphSdl); // .toAPISchema({ exposeDirectives: ['@transform', '@stream']});
    lastApiSchema = schema.toAPISchema();
  });

  it.each([
    { sameAsCached: true, options: undefined},
    { sameAsCached: true, options: { exposeDirectives: undefined }},
    { sameAsCached: false, options: { exposeDirectives: ['@transform', '@stream'] }},
    { sameAsCached: true, options: { exposeDirectives: ['@stream', '@transform'] }},
    { sameAsCached: false, options: { exposeDirectives: ['@transform', '@stream', '@foo'] }},
    { sameAsCached: false, options: { exposeDirectives: ['@transform', '@stream'] }},
  ])(
  'checking each iteration to see if it generates a new schema',
  ({ sameAsCached, options }) => {
    const tempSchema = schema.toAPISchema(options);
    expect(tempSchema === lastApiSchema).toBe(sameAsCached);
    lastApiSchema = tempSchema;
  });
});
