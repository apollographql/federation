import fs from 'fs';
import { Schema } from '../definitions';
import { buildSchema } from '../buildSchema';
import path from 'path';
import gql from 'graphql-tag';
import { buildSubgraph } from '..';
import { GraphQLError } from 'graphql';

function directiveNames(schema: Schema): string[] {
  return [...schema.allDirectives()].map((directive) => directive.name);
}

function typeNames(schema: Schema): string[] {
  return [...schema.allTypes()].map((type) => type.name);
}

describe('toAPISchema', () => {
  let schema: Schema;
  let apiSchema: Schema;

  beforeAll(() => {
    const schemaPath = path.join(
      __dirname,
      'supergraphSdl.graphql',
    );
    const supergraphSdl = fs.readFileSync(schemaPath, 'utf8');
    schema = buildSchema(supergraphSdl);
    apiSchema = schema.toAPISchema({ exposeDirectives: ['@transform', '@stream']});
  });

  it(`doesn't include core directives`, () => {
    expect(directiveNames(apiSchema)).toEqual(expect.not.arrayContaining(['core']));
  });

  it(`doesn't include join directives`, () => {
    expect(directiveNames(apiSchema)).toEqual(
      expect.not.arrayContaining([
        'join__graph',
        'join__type',
        'join__owner',
        'join__field',
      ]),
    );
  });

  it(`doesn't include join types`, () => {
    expect(typeNames(apiSchema)).toEqual(
      expect.not.arrayContaining(['join__FieldSet', 'join__Graph']),
    );
  });

  it(`does pass through other custom directives if exposed`, () => {
    expect(directiveNames(apiSchema)).toEqual(
      expect.arrayContaining([ 'transform', 'stream' ]),
    );
  });

  it(`does not pass through other custom directives if not exposed`, () => {
    const myApiSchema = schema.toAPISchema();
    expect(directiveNames(myApiSchema)).toEqual(
      expect.not.arrayContaining([ 'transform', 'stream' ]),
    );
  });

  it('built in directives are still exported even if not explicitly exposed', () => {
    const subgraph = buildSubgraph('S', '', gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@tag"])
        @link(url: "https://specs.apollo.dev/link/v1.0")

      type Query {
        q: Int
      }

      scalar UUID @specifiedBy(url: "https://tools.ietf.org/html/rfc4122")

      type User {
        k: ID
        a: Int @deprecated
      }
    `);
    const { schema } = subgraph;
    const apiSchema = schema.toAPISchema();
    expect(apiSchema.elementByCoordinate('User.a')?.appliedDirectives
      .find(d => d.name === 'deprecated')
    ).toBeDefined();
    expect(apiSchema.elementByCoordinate('UUID')?.appliedDirectives
      .find(d => d.name === 'specifiedBy' && d.arguments().url === 'https://tools.ietf.org/html/rfc4122')
    ).toBeDefined();
  });

  it('tag exported even if we rename it', () => {
    const subgraph = buildSubgraph('S', '', gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0", import: [{name: "@tag", as: "@fedtag"}])
        @link(url: "https://specs.apollo.dev/link/v1.0")

      type Query {
        q: Int
      }

      type User {
        k: ID
        a: Int @fedtag(name: "foo")
      }
    `);
    const { schema } = subgraph;
    const apiSchema = schema.toAPISchema({ exposeDirectives: ['@fedtag'] });
    expect(apiSchema.elementByCoordinate('User.a')?.appliedDirectives
      .find(d => d.name === 'fedtag')
    ).toBeDefined();
  });

  it('removal of non existent directive should fail', () => {
    expect(() => schema.toAPISchema({ exposeDirectives: ['@fakeDirective'] }))
      .toThrowError(new GraphQLError(`Requested exposed directive '@fakeDirective' does not exist in Schema`));
  });

  it('improperly formatted directive name should fail', () => {
    expect(() => schema.toAPISchema({ exposeDirectives: ['@fake-directive'] }))
      .toThrowError(new GraphQLError(`Names must only contain [_a-zA-Z0-9] but "fake-directive" does not.`));
  });

  it('removal of directive should fail if it doesn\'t begin with @', () => {
    expect(() => schema.toAPISchema({ exposeDirectives: ['stream'] }))
      .toThrowError(new GraphQLError(`Requested exposed directive name 'stream' does not start with \"@\"`));
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
    { sameAsCached: false, options: { exposeDirectives: ['@transform', '@stream', '@fragmentDirective'] }},
    { sameAsCached: false, options: { exposeDirectives: ['@transform', '@stream'] }},
  ])(
  'checking each iteration to see if it generates a new schema',
  ({ sameAsCached, options }) => {
    const tempSchema = schema.toAPISchema(options);
    expect(tempSchema === lastApiSchema).toBe(sameAsCached);
    lastApiSchema = tempSchema;
  });
});
