import { FieldNode } from 'graphql';
import { parseSelections } from '../graphql';

describe('graphql utility functions', () => {
  describe('parseSelections', () => {
    it('parses a valid FieldSet', () => {
      const fieldSet = 'foo bar';
      const parsed = parseSelections(fieldSet);
      expect(parsed).toHaveLength(2);
    });

    it('parses a nested FieldSet', () => {
      const fieldSet = 'foo { bar }';
      const parsed = parseSelections(fieldSet);
      expect(parsed).toHaveLength(1);
      expect((parsed[0] as FieldNode).selectionSet?.selections).toHaveLength(1);
    });

    it('throws when injecting an extra operation', () => {
      const invalidFieldSet = 'foo } query X { bar';
      expect(() =>
        parseSelections(invalidFieldSet),
      ).toThrowErrorMatchingInlineSnapshot(
        `"Invalid FieldSet provided: 'foo } query X { bar'. FieldSets may not contain operations within them."`,
      );
    });
  });
});
