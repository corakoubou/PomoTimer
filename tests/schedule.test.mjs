import test from 'node:test';
import assert from 'node:assert/strict';
import { eventsBetween, occursOn } from '../作業用タイマー/wwwroot/js/schedule.js';
const base = { id: 'a', enabled: true, date: '2026-11-16', repeat: 'daily', days: [1, 2, 3, 4, 5], start: '09:00', end: '23:00', startType: 'work-relaxed', endType: 'sleep' };
const dt = value => new Date(value);
test('excluded weekdays skip both actions and dates before the start are excluded', () => {
    assert.equal(occursOn(base, dt('2026-11-15T12:00:00')), false);
    assert.equal(occursOn(base, dt('2026-11-21T12:00:00')), false);
    assert.equal(eventsBetween([base], dt('2026-11-21T00:00:00'), dt('2026-11-21T23:59:59')).length, 0);
});
test('each button is due at its own time with an exclusive lower bound', () => {
    const events = eventsBetween([base], dt('2026-11-16T08:59:59'), dt('2026-11-16T23:00:00'));
    assert.deepEqual(events.map(e => e.type), ['work-relaxed', 'sleep']);
    assert.equal(eventsBetween([base], dt('2026-11-16T09:00:00'), dt('2026-11-16T09:01:00')).length, 0);
});
test('overnight end is based on the start day, including an excluded following day', () => {
    const overnight = { ...base, days: [5], start: '22:00', end: '06:00' };
    const events = eventsBetween([overnight], dt('2026-11-20T21:59:59'), dt('2026-11-21T06:00:00'));
    assert.deepEqual(events.map(e => [e.type, e.at.getDate()]), [['work-relaxed', 20], ['sleep', 21]]);
});
test('single dates do not repeat; disabled schedules do not execute', () => {
    const once = { ...base, repeat: 'once', days: [] };
    assert.equal(occursOn(once, dt('2026-11-16T12:00:00')), true);
    assert.equal(occursOn(once, dt('2026-11-17T12:00:00')), false);
    assert.equal(eventsBetween([{ ...base, enabled: false }], dt('2026-11-16T00:00:00'), dt('2026-11-17T00:00:00')).length, 0);
});
test('shared boundaries apply end actions before the new start', () => {
    const next = { ...base, id: 'b', start: '23:00', end: '23:30' };
    assert.deepEqual(eventsBetween([next, base], dt('2026-11-16T22:59:59'), dt('2026-11-16T23:00:00')).map(e => e.kind), ['end', 'start']);
});
test('deleting one occurrence excludes both actions and preserves following weeks', () => {
    const weekly = { ...base, repeat: 'weekly', days: [1], excludedDates: ['2026-11-16'] };
    assert.equal(occursOn(weekly, dt('2026-11-16T12:00:00')), false);
    assert.equal(eventsBetween([weekly], dt('2026-11-16T00:00:00'), dt('2026-11-17T00:00:00')).length, 0);
    assert.equal(eventsBetween([weekly], dt('2026-11-30T00:00:00'), dt('2026-12-01T00:00:00')).length, 2);
});
test('deleting an overnight occurrence suppresses its next-day end but preserves the previous end', () => {
    const overnight = { ...base, days: [1, 2, 3, 4, 5, 6, 0], start: '22:00', end: '06:00', excludedDates: ['2026-11-17'] };
    const events = eventsBetween([overnight], dt('2026-11-17T00:00:00'), dt('2026-11-18T23:59:59'));
    assert.deepEqual(events.map(e => [e.kind, e.at.getDate()]), [['end', 17], ['start', 18]]);
});

test('weekday holiday membership is controlled by the holiday checkbox, independently of weekdays', () => {
    const weekday = { ...base, repeat: 'weekdays', includeHolidays: false };
    assert.equal(occursOn(weekday, dt('2026-11-23T12:00:00')), false);
    assert.equal(occursOn(weekday, dt('2026-11-24T12:00:00')), true);
    const onlyHolidays = { ...base, days: [], includeHolidays: true };
    assert.equal(occursOn(onlyHolidays, dt('2026-11-23T12:00:00')), true);
    assert.equal(occursOn(onlyHolidays, dt('2026-11-24T12:00:00')), false);
});
test('holiday presets apply to existing weekend/daily schedules, while weekly excludes holidays by default', () => {
    const holiday = dt('2026-11-23T12:00:00');
    assert.equal(occursOn({ ...base, repeat: 'weekends', days: [0, 6] }, holiday), true);
    assert.equal(occursOn({ ...base, repeat: 'daily' }, holiday), true);
    assert.equal(occursOn({ ...base, repeat: 'weekdays' }, holiday), false);
    assert.equal(occursOn({ ...base, repeat: 'weekly', days: [1] }, holiday), false);
    assert.equal(occursOn({ ...base, repeat: 'once', date: '2026-11-23' }, holiday), true);
});
test('holiday checkbox overrides Saturday/Sunday and excluded dates still take precedence', () => {
    const schedule = { ...base, date: '2026-01-01', days: [0, 6], includeHolidays: false };
    assert.equal(occursOn(schedule, dt('2026-05-03T12:00:00')), false);
    assert.equal(occursOn({ ...schedule, includeHolidays: true }, dt('2026-05-03T12:00:00')), true);
    assert.equal(occursOn({ ...schedule, includeHolidays: true, excludedDates: ['2026-05-03'] }, dt('2026-05-03T12:00:00')), false);
});
test('holiday-only schedules execute both actions exactly once', () => {
    const holidays = { ...base, days: [], includeHolidays: true };
    const events = eventsBetween([holidays], dt('2026-11-23T00:00:00'), dt('2026-11-25T00:00:00'));
    assert.deepEqual(events.map(e => e.type), ['work-relaxed', 'sleep']);
});
