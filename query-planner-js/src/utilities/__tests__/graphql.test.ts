import { FieldNode } from 'graphql';
import { parseFieldSet } from '../graphql';

describe('graphql utility functions', () => {
  describe('parseFieldSet', () => {
    it('parses valid `FieldSet`s', () => {
      const fieldSet = 'foo bar';
      const parsed = parseFieldSet(fieldSet);
      expect(parsed).toHaveLength(2);
    });

    it('parses a nested FieldSet', () => {
      const fieldSet = 'foo { bar }';
      const parsed = parseFieldSet(fieldSet);
      expect(parsed).toHaveLength(1);
      expect((parsed[0] as FieldNode).selectionSet?.selections).toHaveLength(1);
    });

    it('disallows empty `FieldSet`s', () => {
      const invalid = '';
      expect(() => parseFieldSet(invalid)).toThrowErrorMatchingInlineSnapshot(
        `"Syntax Error: Expected Name, found \\"}\\"."`,
      );
    });

    it('disallows `FragmentSpread`s', () => {
      const invalid = 'foo ...Bar';
      expect(() => parseFieldSet(invalid)).toThrowErrorMatchingInlineSnapshot(
        `"Field sets may not contain fragment spreads, but found: \\"foo ...Bar\\""`,
      );
    });

    it('disallows nested `FragmentSpread`s', () => {
      const invalid = 'foo { ...Bar }';
      expect(() => parseFieldSet(invalid)).toThrowErrorMatchingInlineSnapshot(
        `"Field sets may not contain fragment spreads, but found: \\"foo { ...Bar }\\""`,
      );
    });

    it('throws when injecting an extra operation', () => {
      const invalidFieldSet = 'foo } query X { bar';
      expect(() =>
        parseFieldSet(invalidFieldSet),
      ).toThrowErrorMatchingInlineSnapshot(
        `"Invalid FieldSet provided: 'foo } query X { bar'. FieldSets may not contain operations within them."`,
      );
    });
  });
});
