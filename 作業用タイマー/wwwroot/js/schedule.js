// Local calendar dates deliberately use the browser's timezone, as does the timer.
export function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function occursOn(schedule, date) {
    const key = dateKey(date);
    return schedule.enabled && key >= schedule.date &&
        (schedule.repeat === 'once' ? key === schedule.date : schedule.days.includes(date.getDay()));
}
export function eventsBetween(schedules, after, until) {
    const events = [];
    const day = new Date(after);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - 1); // An overnight end belongs to the preceding start day.
    for (; day <= until; day.setDate(day.getDate() + 1)) {
        for (const schedule of schedules) {
            if (!occursOn(schedule, day)) continue;
            const start = new Date(day);
            const end = new Date(day);
            const [sh, sm] = schedule.start.split(':').map(Number);
            const [eh, em] = schedule.end.split(':').map(Number);
            start.setHours(sh, sm, 0, 0);
            end.setHours(eh, em, 0, 0);
            if (end <= start) end.setDate(end.getDate() + 1);
            for (const [kind, at, type] of [['start', start, schedule.startType], ['end', end, schedule.endType]]) {
                if (at > after && at <= until) events.push({ at, type, kind, id: schedule.id });
            }
        }
    }
    // At a shared boundary, finish the old schedule before starting the next.
    return events.sort((a, b) => a.at - b.at || (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind === 'end' ? -1 : 1));
}

export function initSchedules({ root, actions, execute }) {
    const storageKey = 'workTimerSchedulesV1';
    let schedules;
    try { schedules = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { schedules = []; }
    if (!Array.isArray(schedules)) schedules = [];
    // Preserve schedules created by the original work-mode data format.
    const legacyTypes = { 'work-strict': 'work:strict', 'work-focus': 'work:focused', 'work-relaxed': 'work:relaxed' };
    schedules.forEach(schedule => {
        schedule.startType = legacyTypes[schedule.startType] || schedule.startType;
        schedule.endType = legacyTypes[schedule.endType] || schedule.endType;
    });
    let month = new Date();
    month.setDate(1);
    let selected = dateKey(new Date());
    let editing = null;
    let cursor = new Date();
    let busy = false;
    const names = ['日', '月', '火', '水', '木', '金', '土'];
    const repeats = { once: 'この日のみ', weekdays: '平日', weekends: '休日', daily: '毎日', weekly: '毎週' };
    root.innerHTML = `
        <div class="schedule-toolbar"><button type="button" id="scheduleToggle" aria-expanded="false">スケジュール設定モード</button><span id="automationSummary"></span></div>
        <section id="schedulePanel" hidden aria-label="スケジュール設定">
          <p>指定した時刻にボタンを自動で押します。アプリを開いている間に実行します。時刻は端末の現地時刻です。</p>
          <div class="schedule-toolbar"><button type="button" id="schedulePrev" aria-label="前の月">◀</button><strong id="scheduleMonth"></strong><button type="button" id="scheduleNext" aria-label="次の月">▶</button><button type="button" id="scheduleToday">今日</button></div>
          <div id="scheduleCalendar" class="schedule-calendar"></div>
          <p>日付をクリックするとその日の予定、曜日をクリックすると毎週の予定を設定できます。平日＝月〜金、休日＝土日（祝日は含みません）。</p>
          <div id="scheduleList"></div>
        </section>
        <p id="scheduleMessage" role="status"></p>
        <dialog id="scheduleDialog" aria-labelledby="scheduleTitle">
          <form id="scheduleForm">
            <h2 id="scheduleTitle">スケジュール設定</h2>
            <label>開始日 <input id="automationDate" type="date" required></label>
            <fieldset><legend>開始時に押すボタン</legend><input aria-label="開始時刻" id="scheduleStart" type="time" required><select aria-label="開始ボタン" id="scheduleStartType"></select></fieldset>
            <fieldset><legend>終了時に押すボタン</legend><input aria-label="終了時刻" id="scheduleEnd" type="time" required><select aria-label="終了ボタン" id="scheduleEndType"></select></fieldset>
            <p>終了時刻が開始時刻以前の場合は翌日に実行します。</p>
            <label>繰り返し <select id="scheduleRepeat">${Object.entries(repeats).map(([v, label]) => `<option value="${v}">${label}</option>`).join('')}</select></label>
            <fieldset id="scheduleDays"><legend>実行する曜日（外した曜日は開始・終了とも実行しません）</legend>${names.map((name, day) => `<label><input type="checkbox" value="${day}">${name}</label>`).join('')}</fieldset>
            <p id="scheduleError" role="alert"></p>
            <div class="schedule-toolbar"><button type="submit">保存</button><button type="button" id="scheduleCancel">キャンセル</button></div>
          </form>
        </dialog>`;
    const el = id => root.querySelector('#' + id);
    const checks = [...el('scheduleDays').querySelectorAll('input')];
    for (const id of ['scheduleStartType', 'scheduleEndType']) {
        for (const [type, label] of Object.entries(actions)) el(id).add(new Option(label, type));
    }
    function persist() { localStorage.setItem(storageKey, JSON.stringify(schedules)); }
    function setDays(days) { checks.forEach(c => c.checked = days.includes(Number(c.value))); }
    function preset() {
        const repeat = el('scheduleRepeat').value;
        el('scheduleDays').hidden = repeat === 'once';
        const day = new Date(el('automationDate').value + 'T12:00:00').getDay();
        setDays(repeat === 'weekdays' ? [1, 2, 3, 4, 5] : repeat === 'weekends' ? [0, 6] : repeat === 'weekly' ? [day] : [0, 1, 2, 3, 4, 5, 6]);
    }
    function open(schedule, date = selected, weekly = false) {
        editing = schedule?.id ?? null;
        el('automationDate').value = schedule?.date ?? date;
        el('scheduleStart').value = schedule?.start ?? '09:00';
        el('scheduleEnd').value = schedule?.end ?? '23:00';
        el('scheduleStartType').value = schedule?.startType ?? 'work:relaxed';
        el('scheduleEndType').value = schedule?.endType ?? 'sleep';
        el('scheduleRepeat').value = schedule?.repeat ?? (weekly ? 'weekly' : 'once');
        preset();
        if (schedule) setDays(schedule.days);
        el('scheduleError').textContent = '';
        el('scheduleDialog').showModal();
    }
    function render() {
        el('automationSummary').textContent = `有効な予定：${schedules.filter(s => s.enabled).length}件`;
        el('scheduleMonth').textContent = `${month.getFullYear()}年${month.getMonth() + 1}月`;
        const calendar = el('scheduleCalendar');
        calendar.replaceChildren();
        names.forEach((name, day) => {
            const button = document.createElement('button');
            button.type = 'button'; button.textContent = name; button.className = 'schedule-weekday';
            button.setAttribute('aria-label', `毎週${name}曜日の予定を設定`);
            button.onclick = () => {
                const date = new Date(month);
                date.setDate(1 + (day - date.getDay() + 7) % 7);
                open(null, dateKey(date), true);
            };
            calendar.append(button);
        });
        for (let i = 0; i < month.getDay(); i++) calendar.append(document.createElement('span'));
        const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
        for (let day = 1; day <= count; day++) {
            const date = new Date(month.getFullYear(), month.getMonth(), day);
            const key = dateKey(date);
            const matching = schedules.filter(s => occursOn(s, date));
            const button = document.createElement('button'); button.type = 'button';
            button.className = 'schedule-day';
            button.classList.toggle('is-today', key === dateKey(new Date()));
            button.setAttribute('aria-label', `${key} 予定${matching.length}件`);
            button.textContent = `${day}${matching.length ? `\n${matching.length}件` : ''}`;
            button.onclick = () => { selected = key; open(null); };
            calendar.append(button);
        }
        const list = el('scheduleList'); list.replaceChildren();
        if (!schedules.length) list.textContent = '予定はまだありません。';
        schedules.forEach(schedule => {
            const row = document.createElement('div'); row.className = 'schedule-item';
            const label = document.createElement('label');
            const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.checked = schedule.enabled;
            toggle.onchange = () => { schedule.enabled = toggle.checked; persist(); render(); };
            label.append(toggle, document.createTextNode(`${schedule.date}〜 ${repeats[schedule.repeat]}${schedule.repeat === 'once' ? '' : `（${schedule.days.map(d => names[d]).join('・')}）`} ${schedule.start} ${actions[schedule.startType]} → ${schedule.end <= schedule.start ? '翌日 ' : ''}${schedule.end} ${actions[schedule.endType]}`));
            row.append(label);
            for (const [text, handler] of [['編集', () => open(schedule)], ['削除', () => { schedules = schedules.filter(s => s.id !== schedule.id); persist(); render(); }]]) {
                const button = document.createElement('button'); button.type = 'button'; button.textContent = text; button.onclick = handler; row.append(button);
            }
            list.append(row);
        });
    }
    el('scheduleToggle').onclick = () => {
        el('schedulePanel').hidden = !el('schedulePanel').hidden;
        el('scheduleToggle').setAttribute('aria-expanded', String(!el('schedulePanel').hidden));
    };
    el('schedulePrev').onclick = () => { month.setMonth(month.getMonth() - 1); render(); };
    el('scheduleNext').onclick = () => { month.setMonth(month.getMonth() + 1); render(); };
    el('scheduleToday').onclick = () => { month = new Date(); month.setDate(1); render(); };
    el('scheduleCancel').onclick = () => el('scheduleDialog').close();
    el('scheduleRepeat').onchange = preset;
    el('scheduleForm').onsubmit = event => {
        event.preventDefault();
        const days = checks.filter(c => c.checked).map(c => Number(c.value));
        if (el('scheduleRepeat').value !== 'once' && !days.length) {
            el('scheduleError').textContent = '実行する曜日を1つ以上選択してください。'; return;
        }
        const schedule = {
            id: editing ?? crypto.randomUUID(), date: el('automationDate').value,
            start: el('scheduleStart').value, end: el('scheduleEnd').value,
            startType: el('scheduleStartType').value, endType: el('scheduleEndType').value,
            repeat: el('scheduleRepeat').value, days,
            enabled: editing ? schedules.find(s => s.id === editing).enabled : true,
            updatedAt: Date.now()
        };
        const next = schedules.filter(s => s.id !== editing).concat(schedule);
        try { localStorage.setItem(storageKey, JSON.stringify(next)); }
        catch { el('scheduleError').textContent = '保存できませんでした。ブラウザーの保存設定・空き容量をご確認ください。'; return; }
        schedules = next;
        el('scheduleDialog').close(); render();
    };
    async function tick() {
        if (busy) return;
        busy = true;
        const until = new Date();
        const due = eventsBetween(schedules, cursor, until).filter(event => {
            const schedule = schedules.find(s => s.id === event.id);
            return event.at.getTime() >= (schedule.updatedAt || 0);
        });
        cursor = until;
        try {
            for (const event of due) {
                try {
                    await execute(event.type, event.at);
                    el('scheduleMessage').textContent = `${event.at.toLocaleString('ja-JP')}：${actions[event.type]}を自動実行しました。`;
                } catch (error) {
                    // A remote sync failure must not prevent later scheduled transitions.
                    el('scheduleMessage').textContent = `自動実行の保存中にエラーが発生しました：${error.message}`;
                }
            }
        } catch (error) {
            el('scheduleMessage').textContent = `スケジュールの実行中にエラーが発生しました：${error.message}`;
        } finally { busy = false; }
    }
    render();
    setInterval(tick, 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
}
