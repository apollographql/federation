import { DirectiveLocation } from 'graphql';
import '../definitions';
import { createDirectiveSpecification } from '../directiveAndTypeSpecification';
import { ARGUMENT_COMPOSITION_STRATEGIES } from '../argumentCompositionStrategies';
import { TAG_VERSIONS } from '../specs/tagSpec';

const supergraphSpecification = () => TAG_VERSIONS.latest();

test('must have supergraph link if composed', () => {
  expect(() =>
    createDirectiveSpecification({
      name: 'foo',
      locations: [DirectiveLocation.OBJECT],
      composes: true,
    }),
  ).toThrow(
    'Should provide a @link specification to use in supergraph for directive @foo if it composes',
  );
});

test('must have a merge strategy on all arguments if any', () => {
  expect(() =>
    createDirectiveSpecification({
      name: 'foo',
      locations: [DirectiveLocation.OBJECT],
      composes: true,
      supergraphSpecification,
      args: [
        {
          name: 'v1',
          type: (schema) => schema.intType(),
          compositionStrategy: ARGUMENT_COMPOSITION_STRATEGIES.MAX,
        },
        { name: 'v2', type: (schema) => schema.intType() },
      ],
    }),
  ).toThrow(
    'Invalid directive specification for @foo: not all arguments define a composition strategy',
  );
});

test('must be not be repeatable if it has a merge strategy', () => {
  expect(() =>
    createDirectiveSpecification({
      name: 'foo',
      locations: [DirectiveLocation.OBJECT],
      composes: true,
      repeatable: true,
      supergraphSpecification,
      args: [
        {
          name: 'v',
          type: (schema) => schema.intType(),
          compositionStrategy: ARGUMENT_COMPOSITION_STRATEGIES.MAX,
        },
      ],
    }),
  ).toThrow(
    'Invalid directive specification for @foo: @foo is repeatable and should not define composition strategy for its arguments',
  );
});
