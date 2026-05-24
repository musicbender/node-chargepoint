import type { ChargeScheduleWindow, TimeString } from './types.js';

function parseTimeString(t: TimeString): [number, number] {
  const parts = (t as string).split(':');
  return [Number(parts[0]), Number(parts[1])];
}

/**
 * Returns true if the time component of `date` falls within the given schedule window.
 *
 * Handles midnight-crossing windows (e.g. startTime "22:00", endTime "06:00").
 * The start boundary is inclusive; the end boundary is exclusive.
 */
export function isWithinChargeScheduleWindow(window: ChargeScheduleWindow, date: Date = new Date()): boolean {
  const [startH, startM] = parseTimeString(window.startTime);
  const [endH, endM] = parseTimeString(window.endTime);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const currentMinutes = date.getHours() * 60 + date.getMinutes();

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  // Midnight-crossing window
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}
