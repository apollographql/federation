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
    const schemaPath = path.join(__dirname, 'supergraphSdl.graphql');
    const supergraphSdl = fs.readFileSync(schemaPath, 'utf8');

    schema = buildSchema(supergraphSdl).toAPISchema();
  });

  it(`doesn't include core directives`, () => {
    expect(directiveNames(schema)).toEqual(
      expect.not.arrayContaining(['core']),
    );
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
      expect.arrayContaining(['transform', 'stream']),
    );
  });
});
