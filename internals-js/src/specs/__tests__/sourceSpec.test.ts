import {
  sourceIdentity,
  parseURLPathTemplate,
  getURLPathTemplateVars,
} from '../index';

describe('SourceSpecDefinition', () => {
  it('should export expected identity URL', () => {
    expect(sourceIdentity).toBe('https://specs.apollo.dev/source');
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
