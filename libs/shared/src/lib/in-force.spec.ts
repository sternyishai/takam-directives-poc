import { isInForce } from './in-force.js';

// The rules come from ADR 0001 and the glossary: dates are compared, inclusive
// at both ends, and an empty valid-to means the Directive has no end date.
describe('isInForce', () => {
  it('is in force between its valid-from and valid-to dates', () => {
    expect(isInForce('2026-01-01', '2026-12-31', '2026-06-15')).toBe(true);
  });

  it('is still in force on its valid-to date (inclusive)', () => {
    expect(isInForce('2026-01-01', '2026-12-31', '2026-12-31')).toBe(true);
  });

  it('is expired the day after its valid-to date', () => {
    expect(isInForce('2026-01-01', '2026-12-31', '2027-01-01')).toBe(false);
  });

  it('has no end when valid-to is empty', () => {
    expect(isInForce('2026-01-11', null, '2099-01-01')).toBe(true);
  });

  it('is in force from its valid-from date (inclusive)', () => {
    expect(isInForce('2026-01-11', null, '2026-01-11')).toBe(true);
  });

  it('is not in force yet when valid-from is in the future', () => {
    expect(isInForce('2026-12-01', null, '2026-11-23')).toBe(false);
  });
});
