import { joinNames } from '../src/domain/format';

describe('joinNames', () => {
  it('returns empty string for no names', () => {
    expect(joinNames([])).toBe('');
  });

  it('returns the single name as-is', () => {
    expect(joinNames(['Leg day'])).toBe('Leg day');
  });

  it('joins two names with "and", no comma', () => {
    expect(joinNames(['Leg day', 'Push day'])).toBe('Leg day and Push day');
  });

  it('joins three or more names with commas and a trailing "and"', () => {
    expect(joinNames(['Leg day', 'Push day', 'Core'])).toBe('Leg day, Push day, and Core');
    expect(joinNames(['A', 'B', 'C', 'D'])).toBe('A, B, C, and D');
  });
});
