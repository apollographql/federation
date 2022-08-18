import { buildSchema } from 'graphql';
import { addExtensions } from '../addExtensions';
const { version } = require('../../../package.json');

describe('addExtensions', () => {

  it('adds gateway extensions to a schema', async () => {
    const schema = buildSchema('type Query { hello: String }');
    expect(schema.extensions).toEqual({});
    expect(addExtensions(schema).extensions).toEqual({ apollo: { gateway: { version: version } } });
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
});
