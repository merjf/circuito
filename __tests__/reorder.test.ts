import { moveItem } from '../src/domain/reorder';

const list = ['a', 'b', 'c', 'd'];

describe('moveItem', () => {
  it('moves rather than swaps — the difference shows across two positions', () => {
    expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    // A swap would have produced ['c', 'b', 'a', 'd'].
  });

  it('moves backwards', () => {
    expect(moveItem(list, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('handles neighbouring moves, where move and swap agree', () => {
    expect(moveItem(list, 1, 2)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('is a no-op when the index does not change', () => {
    expect(moveItem(list, 2, 2)).toEqual(list);
  });

  it('never mutates the input', () => {
    const original = [...list];
    moveItem(list, 0, 3);
    expect(list).toEqual(original);
  });

  it('ignores out-of-range indices rather than dropping an item', () => {
    expect(moveItem(list, 0, 9)).toEqual(list);
    expect(moveItem(list, -1, 2)).toEqual(list);
    expect(moveItem(list, 9, 0)).toEqual(list);
    expect(moveItem(list, 0, 9)).toHaveLength(list.length);
  });

  it('handles a single-item list', () => {
    expect(moveItem(['only'], 0, 0)).toEqual(['only']);
  });
});
