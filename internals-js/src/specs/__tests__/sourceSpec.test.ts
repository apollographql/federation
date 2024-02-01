import { sourceIdentity } from '../sourceSpec';

describe('SourceSpecDefinition', () => {
  it('should export expected identity URL', () => {
    expect(sourceIdentity).toBe('https://specs.apollo.dev/source');
  });
});