import { buildSchema } from 'graphql';
import { addExtensions } from '../addExtensions';
import { ApolloGraphQLSchemaExtensions } from "../../typings/graphql";
const { version } = require('../../../package.json');

describe('addExtensions', () => {

  it('adds gateway extensions to a schema', async () => {
    const schema = buildSchema('type Query { hello: String }');
    expect(schema.extensions).toEqual({});
    const actualExtensions = addExtensions(schema).extensions as ApolloGraphQLSchemaExtensions;
    expect(actualExtensions).toEqual({ apollo: { gateway: { version: version } } });
  });

  it('does not delete existing extensions', async () => {
    const schema = buildSchema('type Query { hello: String }');
    expect(schema.extensions).toEqual({});
    schema.extensions = {
      foo: 'bar',
      apollo: {
        gateway: {
          version: 'hello'
        }
      }
    };
    expect(addExtensions(schema).extensions).toEqual({
      foo: 'bar',
      apollo: {
        gateway: {
          version: version
        }
      }
    });
  });

  it('works with undefined apollo block', async () => {
    const schema = buildSchema('type Query { hello: String }');
    expect(schema.extensions).toEqual({});
    schema.extensions = {
      apollo: undefined
    };
    expect(addExtensions(schema).extensions).toEqual({
      apollo: {
        gateway: {
          version: version
        }
      }
    });
  });

  it('works with undefined gateway block', async () => {
    const schema = buildSchema('type Query { hello: String }');
    expect(schema.extensions).toEqual({});
    schema.extensions = {
      apollo: {
        gateway: undefined
      }
    };
    expect(addExtensions(schema).extensions).toEqual({
      apollo: {
        gateway: {
          version: version
        }
      }
    });
  });
});
