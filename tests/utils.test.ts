import { describe, expect, it } from 'vitest';
import { isWithinChargeScheduleWindow } from '../src/utils.js';
import type { ChargeScheduleWindow } from '../src/types.js';

function makeDate(hours: number, minutes: number): Date {
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}

describe('isWithinChargeScheduleWindow()', () => {
  const solarWindow: ChargeScheduleWindow = { startTime: '9:00', endTime: '17:00' };
  const overnightWindow: ChargeScheduleWindow = { startTime: '22:00', endTime: '6:00' };

  describe('normal (non-midnight-crossing) window', () => {
    it('returns true when time is inside the window', () => {
      // 13:10 is the scenario from the bug report — high solar at 1:10 PM
      expect(isWithinChargeScheduleWindow(solarWindow, makeDate(13, 10))).toBe(true);
    });

    it('returns true at the start boundary (inclusive)', () => {
      expect(isWithinChargeScheduleWindow(solarWindow, makeDate(9, 0))).toBe(true);
    });

    it('returns false at the end boundary (exclusive)', () => {
      expect(isWithinChargeScheduleWindow(solarWindow, makeDate(17, 0))).toBe(false);
    });

    it('returns false before the window', () => {
      expect(isWithinChargeScheduleWindow(solarWindow, makeDate(8, 59))).toBe(false);
    });

    it('returns false after the window', () => {
      expect(isWithinChargeScheduleWindow(solarWindow, makeDate(17, 1))).toBe(false);
    });
  });

  describe('midnight-crossing window', () => {
    it('returns true when time is after start (same evening)', () => {
      expect(isWithinChargeScheduleWindow(overnightWindow, makeDate(23, 30))).toBe(true);
    });

    it('returns true at the start boundary', () => {
      expect(isWithinChargeScheduleWindow(overnightWindow, makeDate(22, 0))).toBe(true);
    });

    it('returns true when time is before end (early morning)', () => {
      expect(isWithinChargeScheduleWindow(overnightWindow, makeDate(3, 0))).toBe(true);
    });

    it('returns false at the end boundary (exclusive)', () => {
      expect(isWithinChargeScheduleWindow(overnightWindow, makeDate(6, 0))).toBe(false);
    });

    it('returns false during midday — reproduces the 1:10 PM solar bug', () => {
      expect(isWithinChargeScheduleWindow(overnightWindow, makeDate(13, 10))).toBe(false);
    });

    it('returns false between end and start', () => {
      expect(isWithinChargeScheduleWindow(overnightWindow, makeDate(12, 0))).toBe(false);
    });
  });
});
