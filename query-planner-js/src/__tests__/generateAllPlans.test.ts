import { assert } from '@apollo/federation-internals';
import { generateAllPlansAndFindBest } from '../generateAllPlans';

function generateTestPlans(initial: string[], choices: string[][]): { best: string[], generated: string[][], evaluated: string[][] } {
  const generated: string[][] = [];
  const evaluated: string[][] = [];
  const { best } = generateAllPlansAndFindBest({
    initial,
    toAdd: choices,
    addFct: (p, c) => {
      const r = p.concat(c);
      if (r.length === initial.length + choices.length) {
        generated.push(r);
      }
      return r;
    },
    costFct: (p) => {
      evaluated.push(p);
      return p.reduce((acc, v) => acc + v.length, 0);
    },
  });
  return { best, generated, evaluated };
}

function expectSamePlans(expected: string[][], actual: string[][]) {
  // We don't want to rely on ordering (the tests ensures we get the best plan that we want, and the rest doesn't matter).
  const normalize = (v: string[]) => v.join('');
  const expectedSet = new Set<string>(expected.map((e) => normalize(e)));
  for (const value of actual) {
    const normalized = normalize(value);
    assert(expectedSet.has(normalized), `Unexpected plan [${value.join(', ')}] is not in [\n${expected.map((e) => `[ ${e.join(', ')} ]`).join('\n')}\n]`);
  }

  const actualSet = new Set<string>(actual.map((e) => normalize(e)));
  for (const value of expected) {
    const normalized = normalize(value);
    assert(actualSet.has(normalized), `Expected plan [${value.join(', ')}] not found in [\n${actual.map((e) => `[ ${e.join(', ')} ]`).join('\n')}\n]`);
  }
}


test('Pick elements at same index first', () => {
  const { best, generated } = generateTestPlans(
    ['I'], 
    [
      [ 'A1', 'B1'],
      [ 'A2', 'B2'],
      [ 'A3', 'B3'],
    ],
  );
  expect(best).toEqual(['I', 'A1', 'A2', 'A3']);
  expect(generated[0]).toEqual(['I', 'A1', 'A2', 'A3']);
  expect(generated[1]).toEqual(['I', 'B1', 'B2', 'B3']);
})

test('Bail early for more costly elements', () => {
  const { best, generated } = generateTestPlans(
    ['I'], 
    [
      [ 'A1', 'B1VeryCostly'],
      [ 'A2', 'B2Co'],
      [ 'A3', 'B3'],
    ],
  );

  expect(best).toEqual(['I', 'A1', 'A2', 'A3']);
  // We should ignore plans with both B1 and B2 due there cost. So we should have just 2 plans.
  expect(generated).toHaveLength(2);
  expect(generated[0]).toEqual(['I', 'A1', 'A2', 'A3']);
  expect(generated[1]).toEqual(['I', 'A1', 'A2', 'B3']);
})

test('Handles branches of various sizes', () => {
  const { best, generated } = generateTestPlans(
    ['I'], 
    [
      [ 'A1x', 'B1'],
      [ 'A2', 'B2Costly', 'C2'],
      [ 'A3'],
      [ 'A4', 'B4' ],
    ],
  );

  expect(best).toEqual(['I', 'B1', 'A2', 'A3', 'A4']);
  // We should generate every option, except those including `B2Costly`
  expectSamePlans([
    [ 'I', 'A1x', 'A2', 'A3', 'A4' ],
    [ 'I', 'A1x', 'A2', 'A3', 'B4' ],
    [ 'I', 'A1x', 'C2', 'A3', 'A4' ],
    [ 'I', 'A1x', 'C2', 'A3', 'B4' ],
    [ 'I', 'B1', 'A2', 'A3', 'A4' ],
    [ 'I', 'B1', 'A2', 'A3', 'B4' ],
    [ 'I', 'B1', 'C2', 'A3', 'A4' ],
    [ 'I', 'B1', 'C2', 'A3', 'B4' ],
  ], generated);
})
