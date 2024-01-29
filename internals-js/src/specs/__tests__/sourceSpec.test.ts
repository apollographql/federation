import {
  sourceIdentity,
  parseJSONSelection,
  getSelectionOutputShape,
  parseURLPathTemplate,
  getURLPathTemplateVars,
} from '../index';

describe('SourceSpecDefinition', () => {
  it('should export expected identity URL', () => {
    expect(sourceIdentity).toBe('https://specs.apollo.dev/source');
  });
});

function parseSelectionExpectingNoErrors(selection: string) {
  const ast = parseJSONSelection(selection);
  expect(ast.errors).toEqual([]);
  return ast;
}

describe('parseJSONSelection', () => {
  it('parses simple selections', () => {
    expect(parseSelectionExpectingNoErrors('a').type).toBe('Selection');
    expect(parseSelectionExpectingNoErrors('a b').type).toBe('Selection');
    expect(parseSelectionExpectingNoErrors('a b { c }').type).toBe('Selection');
    expect(parseSelectionExpectingNoErrors('.a').type).toBe('Selection');
    expect(parseSelectionExpectingNoErrors('.a.b.c').type).toBe('Selection');
  });

  const complexSelection = `
    # Basic field selection.
    foo

    # Similar to a GraphQL alias with a subselection.
    barAlias: bar { x y z }

    # Similar to a GraphQL alias without a subselection, but allowing for JSON
    # properties that are not valid GraphQL Name identifiers.
    quotedAlias: "string literal" { nested stuff }

    # Apply a subselection to the result of extracting .foo.bar, and alias it.
    pathAlias: .foo.bar { a b c }

    # Nest various fields under a new key (group).
    group: { foo baz: bar { x y z } }

    # Get the first event from events and apply a selection and an alias to it.
    firstEvent: .events.0 { id description }

    # Apply the { nested stuff } selection to any remaining properties and alias
    # the result as starAlias. Note that any * selection must appear last in the
    # sequence of named selections, and will be typed as JSON regardless of what
    # is subselected, because the field names are unknown.
    starAlias: * { nested stuff }
  `;
  // TODO Improve error message when other named selections accidentally follow
  // a * selection.

  it('parses a multiline selection with comments', () => {
    expect(parseSelectionExpectingNoErrors(complexSelection).type).toBe('Selection');
  });

  describe('getSelectionOutputShape', () => {
    it('returns the correct output shape for a simple selection', () => {
      const ast = parseSelectionExpectingNoErrors('a');
      expect(getSelectionOutputShape(ast)).toEqual({
        a: 'JSON',
      });
    });

    it('returns the correct output shape for a complex selection', () => {
      const ast = parseSelectionExpectingNoErrors(complexSelection);
      expect(getSelectionOutputShape(ast)).toEqual({
        foo: 'JSON',
        barAlias: {
          x: 'JSON',
          y: 'JSON',
          z: 'JSON',
        },
        quotedAlias: {
          nested: 'JSON',
          stuff: 'JSON',
        },
        pathAlias: {
          a: 'JSON',
          b: 'JSON',
          c: 'JSON',
        },
        group: {
          foo: 'JSON',
          baz: {
            x: 'JSON',
            y: 'JSON',
            z: 'JSON',
          },
        },
        starAlias: 'JSON',
        firstEvent: {
          id: 'JSON',
          description: 'JSON',
        },
      });
    });

    it('returns the correct output shape for a selection with nested fields', () => {
      const ast = parseSelectionExpectingNoErrors(`
        a
        b { c d }
        e { f { g h } }
        i { j { k l } }
        m { n o { p q } }
        r { s t { u v } }
        w { x { y z } }
      `);

      expect(getSelectionOutputShape(ast)).toEqual({
        a: 'JSON',
        b: {
          c: 'JSON',
          d: 'JSON',
        },
        e: {
          f: {
            g: 'JSON',
            h: 'JSON',
          },
        },
        i: {
          j: {
            k: 'JSON',
            l: 'JSON',
          },
        },
        m: {
          n: 'JSON',
          o: {
            p: 'JSON',
            q: 'JSON',
          },
        },
        r: {
          s: 'JSON',
          t: {
            u: 'JSON',
            v: 'JSON',
          },
        },
        w: {
          x: {
            y: 'JSON',
            z: 'JSON',
          },
        },
      });
    });
  });
});

describe('parseURLPathTemplate', () => {
  it('allows an empty path', () => {
    const ast = parseURLPathTemplate('/');
    expect(ast.errors).toEqual([]);
    expect(getURLPathTemplateVars(ast)).toEqual({});
  });

  it('allows query params only', () => {
    const ast = parseURLPathTemplate('/?param={param}&other={other}');
    expect(ast.errors).toEqual([]);
    const vars = getURLPathTemplateVars(ast);
    expect(Object.keys(vars).sort()).toEqual([
      'other',
      'param',
    ]);
  });

  it('allows empty query parameters after a /?', () => {
    const ast = parseURLPathTemplate('/?');
    expect(ast.errors).toEqual([]);
    expect(getURLPathTemplateVars(ast)).toEqual({});
  });

  it('allows valueless keys in query parameters', () => {
    const ast = parseURLPathTemplate('/?a&b=&c&d=&e');
    expect(ast.errors).toEqual([]);
    const vars = getURLPathTemplateVars(ast);
    expect(Object.keys(vars).sort()).toEqual([]);
  });

  it.each([
    '/users/{userId}/posts/{postId}',
    '/users/{userId}/posts/{postId}/',
    '/users/{userId}/posts/{postId}/junk',
  ] as const)('parses path-only templates with variables: %s', pathTemplate => {
    const ast = parseURLPathTemplate(pathTemplate);
    expect(ast.errors).toEqual([]);
    const vars = getURLPathTemplateVars(ast);
    expect(Object.keys(vars).sort()).toEqual([
      'postId',
      'userId',
    ]);
  });

  it.each([
    '/users/{user.id}/posts/{post.id}',
    '/users/{user.id}/posts/{post.id}/',
    '/users/{user.id}/posts/{post.id}/junk',
  ] as const)('parses path template with nested vars: %s', pathTemplate => {
    const ast = parseURLPathTemplate(pathTemplate);
    expect(ast.errors).toEqual([]);
    const vars = getURLPathTemplateVars(ast);
    expect(Object.keys(vars).sort()).toEqual([
      'post.id',
      'user.id',
    ]);
  });

  it.each([
    '/users/{user.id}?param={param}',
    '/users/{user.id}/?param={param}',
    '/users/{user.id}/junk?param={param}',
    '/users/{user.id}/{param}?',
  ] as const)('parses templates with query parameters: %s', pathTemplate => {
    const ast = parseURLPathTemplate(pathTemplate);
    expect(ast.errors).toEqual([]);
    const vars = getURLPathTemplateVars(ast);
    expect(Object.keys(vars).sort()).toEqual([
      'param',
      'user.id',
    ]);
  });

  it.each([
    '/location/{latitude},{longitude}?filter={filter}',
    '/location/{latitude},{longitude}/?filter={filter}',
    '/location/{latitude},{longitude}/junk?filter={filter}',
    '/location/lat:{latitude},lon:{longitude}?filter={filter}',
    '/location/lat:{latitude},lon:{longitude}/?filter={filter!}',
    '/location/lat:{latitude},lon:{longitude}/junk?filter={filter!}',
    '/?lat={latitude}&lon={longitude}&filter={filter}',
    '/?location={latitude},{longitude}&filter={filter}',
    '/?filter={filter}&location={latitude!}-{longitude!}',
  ] as const)('should parse a template with multi-var segments: %s', pathTemplate => {
    const ast = parseURLPathTemplate(pathTemplate);
    expect(ast.errors).toEqual([]);
    const vars = getURLPathTemplateVars(ast);
    expect(Object.keys(vars).sort()).toEqual([
      'filter',
      'latitude',
      'longitude',
    ]);
  });

  it.each([
    '/users?ids={uid,...}&filter={filter}',
    '/users_batch/{uid,...}?filter={filter}',
  ] as const)('can parse batch endpoints: %s', pathTemplate => {
    const ast = parseURLPathTemplate(pathTemplate);
    expect(ast.errors).toEqual([]);
    const vars = getURLPathTemplateVars(ast);
    expect(vars).toEqual({
      uid: {
        batchSep: ',',
      },
      filter: {},
    });
  });
});
