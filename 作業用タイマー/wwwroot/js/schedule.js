// Local calendar dates deliberately use the browser's timezone, as does the timer.
export function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function occursOn(schedule, date) {
    const key = dateKey(date);
    return schedule.enabled && key >= schedule.date && !(schedule.excludedDates || []).includes(key) &&
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
    let dialogDate = selected;
    let dialogWeekly = false;
    let cursor = new Date();
    let busy = false;
    let view = 'calendar';
    let listKind = 'once';
    const names = ['日', '月', '火', '水', '木', '金', '土'];
    const repeats = { once: 'この日のみ', weekdays: '平日', weekends: '休日', daily: '毎日', weekly: '毎週' };
    root.innerHTML = `
        <section id="schedulePanel" aria-label="スケジュール設定">
          <p>指定した時刻にボタンを自動で押します。アプリを開いている間に実行します。時刻は端末の現地時刻です。</p>
          <div class="schedule-toolbar schedule-mode-switch" role="group" aria-label="スケジュールの表示">
            <button type="button" id="scheduleCalendarMode" aria-pressed="true">カレンダー</button>
            <button type="button" id="scheduleListMode" aria-pressed="false">登録済み一覧</button>
          </div>
          <div id="scheduleCalendarView">
          <div class="schedule-toolbar"><button type="button" id="schedulePrev" aria-label="前の月">◀</button><strong id="scheduleMonth"></strong><button type="button" id="scheduleNext" aria-label="次の月">▶</button><button type="button" id="scheduleToday">今日</button></div>
          <div id="scheduleCalendar" class="schedule-calendar"></div>
          <p>日付をクリックするとその日の予定、曜日をクリックすると毎週の予定を設定できます。平日＝月〜金、休日＝土日（祝日は含みません）。</p>
          </div>
          <div id="scheduleRegisteredView" hidden>
            <div class="schedule-toolbar" role="group" aria-label="予定の種類">
              <button type="button" id="scheduleOnceFilter" aria-pressed="true">その日だけ</button>
              <button type="button" id="scheduleRecurringFilter" aria-pressed="false">繰り返し</button>
              <button type="button" id="scheduleAdd">予定を追加</button>
            </div>
            <p id="scheduleListDescription"></p>
            <div id="scheduleList"></div>
          </div>
        </section>
        <p id="scheduleMessage" role="status"></p>
        <dialog id="scheduleDialog" aria-labelledby="scheduleTitle">
          <form id="scheduleForm">
            <h2 id="scheduleTitle">スケジュール設定</h2>
            <div class="schedule-toolbar" role="group" aria-label="予定の操作モード">
              <button type="button" id="scheduleNewMode" aria-pressed="true">新規追加</button>
              <button type="button" id="scheduleEditMode" aria-pressed="false">既存を編集</button>
            </div>
            <div id="scheduleExistingPicker" hidden>
              <label>編集する予定 <select id="scheduleExisting"></select></label>
              <p id="scheduleEditHint"></p>
            </div>
            <fieldset id="scheduleFields"><legend>予定の内容</legend>
            <label>開始日 <input id="automationDate" type="date" required></label>
            <fieldset><legend>開始時に押すボタン</legend><input aria-label="開始時刻" id="scheduleStart" type="time" required><select aria-label="開始ボタン" id="scheduleStartType"></select></fieldset>
            <fieldset><legend>終了時に押すボタン</legend><input aria-label="終了時刻" id="scheduleEnd" type="time" required><select aria-label="終了ボタン" id="scheduleEndType"></select></fieldset>
            <p>終了時刻が開始時刻以前の場合は翌日に実行します。</p>
            <label>繰り返し <select id="scheduleRepeat">${Object.entries(repeats).map(([v, label]) => `<option value="${v}">${label}</option>`).join('')}</select></label>
            <fieldset id="scheduleDays"><legend>実行する曜日（外した曜日は開始・終了とも実行しません）</legend>${names.map((name, day) => `<label><input type="checkbox" value="${day}">${name}</label>`).join('')}</fieldset>
            </fieldset>
            <div id="scheduleDeleteControls" hidden>
              <label id="scheduleDeleteScopeLabel">削除する範囲
                <select id="scheduleDeleteScope"><option value="day">この日だけ削除</option><option value="all">すべて削除</option></select>
              </label>
              <p id="scheduleDeleteDate"></p>
              <button type="button" id="scheduleDelete">削除</button>
            </div>
            <p id="scheduleError" role="alert"></p>
            <div class="schedule-toolbar"><button type="submit" id="scheduleSave">保存</button><button type="button" id="scheduleCancel">キャンセル</button></div>
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
    function fill(schedule) {
        editing = schedule?.id ?? null;
        el('automationDate').value = schedule?.date ?? dialogDate;
        el('scheduleStart').value = schedule?.start ?? '09:00';
        el('scheduleEnd').value = schedule?.end ?? '23:00';
        el('scheduleStartType').value = schedule?.startType ?? 'work:relaxed';
        el('scheduleEndType').value = schedule?.endType ?? 'sleep';
        el('scheduleRepeat').value = schedule?.repeat ?? (dialogWeekly ? 'weekly' : 'once');
        preset();
        if (schedule) setDays(schedule.days);
        el('scheduleError').textContent = '';
        el('scheduleDeleteControls').hidden = !schedule;
        el('scheduleDeleteScopeLabel').hidden = !schedule || schedule.repeat === 'once';
        el('scheduleDeleteScope').value = 'day';
        el('scheduleDeleteDate').textContent = schedule?.repeat !== 'once' && schedule
            ? `「この日だけ」の対象：${dialogDate}（開始日）。繰り返し予定の編集は全体に適用されます。` : '';
    }
    function setDialogMode(mode, id) {
        const isEdit = mode === 'edit';
        el('scheduleNewMode').setAttribute('aria-pressed', String(!isEdit));
        el('scheduleEditMode').setAttribute('aria-pressed', String(isEdit));
        el('scheduleExistingPicker').hidden = !isEdit;
        const schedule = isEdit ? schedules.find(item => item.id === (id || el('scheduleExisting').value)) : null;
        const empty = isEdit && !schedule;
        el('scheduleFields').disabled = empty;
        el('scheduleSave').disabled = empty;
        el('scheduleEditHint').textContent = empty ? 'この日に編集できる予定はありません。' : '';
        fill(schedule);
    }
    function open(schedule, date = schedule?.date ?? selected, weekly = false) {
        dialogDate = date;
        dialogWeekly = weekly;
        const day = new Date(date + 'T12:00:00');
        const dialogCandidates = schedules.filter(item => item.id === schedule?.id || occursOn({ ...item, enabled: true }, day))
            .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
        const picker = el('scheduleExisting');
        picker.replaceChildren();
        dialogCandidates.forEach(item => picker.add(new Option(
            `${item.start} ${actions[item.startType]}から${item.end <= item.start ? '翌日 ' : ''}${item.end} ${actions[item.endType]}${item.enabled ? '' : '（無効）'}`, item.id)));
        if (schedule) picker.value = schedule.id;
        setDialogMode(schedule ? 'edit' : 'new', schedule?.id);
        el('scheduleDialog').showModal();
    }
    function removeSchedule(schedule, date) {
        const recurring = schedule.repeat !== 'once';
        const all = !recurring || el('scheduleDeleteScope').value === 'all';
        if (recurring && all && !window.confirm('この繰り返し予定をすべて削除します。ほかの日の予定も削除され、元に戻せません。削除しますか？')) return;
        const next = all ? schedules.filter(item => item.id !== schedule.id) : schedules.map(item => item.id === schedule.id
            ? { ...item, excludedDates: [...new Set([...(item.excludedDates || []), date])] } : item);
        try { localStorage.setItem(storageKey, JSON.stringify(next)); }
        catch { el('scheduleError').textContent = '削除を保存できませんでした。ブラウザーの保存設定・空き容量をご確認ください。'; return; }
        schedules = next;
        el('scheduleDialog').close();
        render();
    }
    function render() {
        el('scheduleCalendarView').hidden = view !== 'calendar';
        el('scheduleRegisteredView').hidden = view !== 'list';
        el('scheduleCalendarMode').setAttribute('aria-pressed', String(view === 'calendar'));
        el('scheduleListMode').setAttribute('aria-pressed', String(view === 'list'));
        el('scheduleOnceFilter').setAttribute('aria-pressed', String(listKind === 'once'));
        el('scheduleRecurringFilter').setAttribute('aria-pressed', String(listKind === 'recurring'));
        el('scheduleListDescription').textContent = listKind === 'once'
            ? '指定した日だけ実行する予定です。'
            : '平日・休日・毎日・毎週など、繰り返し実行する予定です。';
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
        calendar.style.setProperty('--calendar-weeks', Math.ceil((month.getDay() + count) / 7));
        for (let day = 1; day <= count; day++) {
            const date = new Date(month.getFullYear(), month.getMonth(), day);
            const key = dateKey(date);
            const matching = schedules.filter(s => occursOn(s, date)).sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
            const button = document.createElement('button'); button.type = 'button';
            button.className = 'schedule-day';
            button.classList.toggle('is-today', key === dateKey(new Date()));
            const descriptions = matching.map(schedule => `${schedule.start}から ${actions[schedule.startType]}、${schedule.end <= schedule.start ? '翌日 ' : ''}${schedule.end}まで ${actions[schedule.endType]}`);
            button.setAttribute('aria-label', `${key}${descriptions.length ? ' ' + descriptions.join('、') : ' 予定なし'}`);
            const dayLabel = document.createElement('span');
            dayLabel.className = 'schedule-day-number';
            dayLabel.textContent = day;
            button.append(dayLabel);
            matching.forEach(schedule => {
                const detail = document.createElement('span');
                detail.className = 'schedule-day-detail';
                for (const text of [`${schedule.start}から ${actions[schedule.startType]}`, `${schedule.end <= schedule.start ? '翌日 ' : ''}${schedule.end}まで ${actions[schedule.endType]}`]) {
                    const line = document.createElement('span');
                    line.textContent = text;
                    detail.append(line);
                }
                button.append(detail);
            });
            button.onclick = () => { selected = key; open(null); };
            calendar.append(button);
        }
        const list = el('scheduleList'); list.replaceChildren();
        const registered = schedules.filter(schedule => (schedule.repeat === 'once') === (listKind === 'once'))
            .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
        if (!registered.length) list.textContent = listKind === 'once'
            ? 'その日だけの予定はまだありません。' : '繰り返しの予定はまだありません。';
        registered.forEach(schedule => {
            const row = document.createElement('div'); row.className = 'schedule-item';
            const label = document.createElement('label');
            const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.checked = schedule.enabled;
            toggle.onchange = () => { schedule.enabled = toggle.checked; persist(); render(); };
            label.append(toggle, document.createTextNode(`${schedule.date}〜 ${repeats[schedule.repeat]}${schedule.repeat === 'once' ? '' : `（${schedule.days.map(d => names[d]).join('・')}）`} ${schedule.start} ${actions[schedule.startType]} → ${schedule.end <= schedule.start ? '翌日 ' : ''}${schedule.end} ${actions[schedule.endType]}`));
            if (schedule.excludedDates?.length) {
                const exclusions = document.createElement('span');
                exclusions.className = 'schedule-exclusions';
                exclusions.textContent = `除外日：${schedule.excludedDates.join('、')}`;
                label.append(exclusions);
            }
            row.append(label);
            for (const [text, handler] of [['編集', () => open(schedule)], ['削除', () => { open(schedule); if (schedule.repeat === 'once') removeSchedule(schedule, dialogDate); else el('scheduleDeleteScope').focus(); }]]) {
                const button = document.createElement('button'); button.type = 'button'; button.textContent = text; button.onclick = handler; row.append(button);
            }
            list.append(row);
        });
    }
    el('scheduleCalendarMode').onclick = () => { view = 'calendar'; render(); };
    el('scheduleListMode').onclick = () => { view = 'list'; render(); };
    el('scheduleOnceFilter').onclick = () => { listKind = 'once'; render(); };
    el('scheduleRecurringFilter').onclick = () => { listKind = 'recurring'; render(); };
    el('scheduleAdd').onclick = () => open(null, dateKey(new Date()), listKind === 'recurring');
    el('schedulePrev').onclick = () => { month.setMonth(month.getMonth() - 1); render(); };
    el('scheduleNext').onclick = () => { month.setMonth(month.getMonth() + 1); render(); };
    el('scheduleToday').onclick = () => { month = new Date(); month.setDate(1); render(); };
    el('scheduleNewMode').onclick = () => setDialogMode('new');
    el('scheduleEditMode').onclick = () => setDialogMode('edit');
    el('scheduleExisting').onchange = () => setDialogMode('edit', el('scheduleExisting').value);
    el('scheduleDelete').onclick = () => {
        const schedule = schedules.find(item => item.id === editing);
        if (schedule) removeSchedule(schedule, dialogDate);
    };
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
            excludedDates: editing ? (schedules.find(s => s.id === editing).excludedDates || []) : [],
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
