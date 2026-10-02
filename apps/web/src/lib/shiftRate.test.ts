import { describe, expect, it } from 'vitest';
import { suggestShiftRate } from './shiftRate';

describe('suggestShiftRate', () => {
  it('follows every keystroke of the hourly price, not just the first digit', () => {
    // Typing "2500" one key at a time used to leave the shift at 16 (2 × 8).
    const typed = ['2', '25', '250', '2500'].map(suggestShiftRate);
    expect(typed).toEqual(['16', '200', '2000', '20000']);
  });

  it('handles decimals and a comma', () => {
    expect(suggestShiftRate('312.5')).toBe('2500');
    expect(suggestShiftRate('312,5')).toBe('2500');
    expect(suggestShiftRate('0.1')).toBe('0.8');
  });

  it('clears the suggestion for empty or invalid input', () => {
    expect(suggestShiftRate('')).toBe('');
    expect(suggestShiftRate('  ')).toBe('');
    expect(suggestShiftRate('abc')).toBe('');
    expect(suggestShiftRate('-5')).toBe('');
    expect(suggestShiftRate('0')).toBe('');
  });
});
