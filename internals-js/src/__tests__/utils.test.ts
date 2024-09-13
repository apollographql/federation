import { OrderedMap } from '../utils';

describe('OrderedMap', () => {
  it('updating value works', () => {
    const orderedMap = new OrderedMap<string, number>();
    orderedMap.add('one', 0);
    expect(orderedMap.get('one')).toBe(0);
    expect(orderedMap.size).toBe(1);

    orderedMap.add('one', 1);
    expect(orderedMap.get('one')).toBe(1);
    expect(orderedMap.size).toBe(1);
    expect(orderedMap.keys()).toEqual(['one']);
    expect(orderedMap.values()).toEqual([1]);
  });

  it('test lexicographical sorting of map (default sorting algorithm)', () => {
    const orderedMap = new OrderedMap<string, number>();
    orderedMap.add('one', 1);
    orderedMap.add('two', 2);
    orderedMap.add('three', 3);
    orderedMap.add('four', 4);
    orderedMap.add('five', 5);
    orderedMap.add('six', 6);
    orderedMap.add('seven', 7);
    orderedMap.add('eight', 8);
    orderedMap.add('nine', 9);

    // keys are in alphabetical order
    expect(orderedMap.keys()).toEqual([
      'eight',
      'five',
      'four',
      'nine',
      'one',
      'seven',
      'six',
      'three',
      'two',
    ]);
    const sortedArr = [8, 5, 4, 9, 1, 7, 6, 3, 2];
    expect(orderedMap.values()).toEqual(sortedArr);

    // test using spread operator to make sure iterator is performing correctly
    expect([...orderedMap]).toEqual(sortedArr);

    // testing get function
    expect(orderedMap.get('one')).toBe(1);
    expect(orderedMap.get('ten')).toBeUndefined();

    // testing size function
    expect(orderedMap.size).toBe(9);
    orderedMap.add('one', 1);
    expect(orderedMap.size).toBe(9);
    expect(orderedMap.values()).toEqual(sortedArr);

    // has function
    expect(orderedMap.has('one')).toBe(true);
    expect(orderedMap.has('fifty')).toBe(false);
  });

  it('sort by string length', () => {
    const orderedMap = new OrderedMap<string, number>(
      (a: string, b: string) => {
        if (a.length < b.length) {
          return -1;
        } else if (b.length < a.length) {
          return 1;
        }
        return 0;
      },
    );
    orderedMap.add('eight', 8);
    orderedMap.add('seventy', 70);
    orderedMap.add('six', 6);
    orderedMap.add('four', 4);

    expect(orderedMap.keys()).toEqual(['six', 'four', 'eight', 'seventy']);
    const sortedArr = [6, 4, 8, 70];
    expect(orderedMap.values()).toEqual(sortedArr);

    // test using spread operator to make sure iterator is performing correctly
    expect([...orderedMap]).toEqual(sortedArr);
  });

  it('sort numerically', () => {
    const orderedMap = new OrderedMap<number, number>();
    orderedMap.add(4, 40);
    orderedMap.add(1, 10);
    orderedMap.add(7, 70);
    orderedMap.add(2, 20);
    orderedMap.add(6, 60);
    orderedMap.add(3, 30);
    orderedMap.add(9, 90);
    orderedMap.add(5, 50);
    orderedMap.add(8, 80);

    const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90];
    expect(orderedMap.keys()).toEqual(keys);
    expect(orderedMap.values()).toEqual(values);
    expect([...orderedMap]).toEqual(values);
  });
});
