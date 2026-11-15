import test from 'node:test';
import assert from 'node:assert/strict';
import { holidayName } from '../作業用タイマー/wwwroot/js/japaneseHolidays.js';
test('Japanese holidays include fixed, Monday, equinox, substitute and citizens holidays', () => {
    for (const [date, name] of Object.entries({
        '2026-01-01': '元日', '2026-01-12': '成人の日', '2026-03-20': '春分の日',
        '2026-05-06': 'こどもの日 振替休日', '2026-09-22': '休日', '2026-11-23': '勤労感謝の日',
        '2027-03-22': '春分の日 振替休日', '2021-07-22': '海の日', '2021-07-23': 'スポーツの日'
    })) assert.equal(holidayName(new Date(date + 'T12:00:00')), name);
    assert.equal(holidayName(new Date('2026-11-24T12:00:00')), '');
});
