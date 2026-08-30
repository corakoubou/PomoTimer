let state = "paused";
let logs = [];
let contStart = null;
let nextWorkNotificationSeconds = 1500;
let draggedLogIndex = null;

const DAILY_KEYS = new Set(["game", "outing", "exercise", "job", "secret", "sleep"]);

const LOG_TYPE_OPTIONS = [
    { value: "work", label: "作業" },
    { value: "paused", label: "一時停止" },
    { value: "break", label: "休憩" },
    { value: "job", label: "お仕事" },
    { value: "sleep", label: "睡眠" }
];

const REST_EARNING_INTERVAL_SECONDS = {
    work: 5,
    job: 30
};
const REST_USAGE_INTERVAL_SECONDS = {
    break: 1,
    sleep: 15,
    paused: 5
};

const WORK_CHEER_MESSAGES = [
    "集中ナイス！その積み重ねが未来を変えるよ💪",
    "よくやった！完璧じゃなくてOK、継続が最強🔥",
    "25分クリア！この調子で次も軽やかにいこう🚀",
    "お疲れさま！一歩ずつ、でも確実に前進してる✨",
    "すごい集中力！このリズムを大事に続けよう🌟"
];

function showWorkNotification() {
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    const msg = WORK_CHEER_MESSAGES[Math.floor(Math.random() * WORK_CHEER_MESSAGES.length)];
    new Notification("25分経過です。いったん休憩しましょう☕", { body: msg });
}

// #region プライベート

// #region 計算

// 時間表示用ゼロパディング
function pad(n) { return String(n).padStart(2, '0'); }

// 秒数をHH:MM:SS形式に変換
function format(t) {
    const sign = t < 0 ? "-" : "";
    const absoluteSeconds = Math.abs(t);
    let h = Math.floor(absoluteSeconds / 3600);
    let m = Math.floor((absoluteSeconds % 3600) / 60);
    let s = absoluteSeconds % 60;
    return sign + pad(h) + ":" + pad(m) + ":" + pad(s);
}

// 現在時刻をHH:MM:SS形式で取得
function now() {
    let d = new Date();
    return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
}

// 今日の日付をYYYY/MM/DD形式で取得
function today() {
    let d = new Date();
    return d.getFullYear() + "/" + pad(d.getMonth() + 1) + "/" + pad(d.getDate());
}

// 日付と時刻の文字列を解析してDateオブジェクトを生成
function parseDateTime(dateStr, timeStr) {
    const [y, m, d] = (dateStr || today()).split(/[\\/]/).map(Number);
    const [h, min, s] = (timeStr || "00:00:00").split(":").map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    dt.setHours(h || 0, min || 0, s || 0, 0);
    return dt;
}

// 時刻入力値を正規化
function normalizeTimeInputValue(value) {
    if (!value) return "";
    let parts = value.replace(/[^0-9]/g, ":").split(":").filter(p => p !== "");
    while (parts.length < 3) parts.push("00");
    let [h, m, s] = parts.map(p => String(parseInt(p, 10) || 0).padStart(2, "0"));
    return `${h}:${m}:${s}`;
}

// 日付入力値を正規化
function normalizeDateInputValue(value) {
    if (!value) return "";
    const parts = value.replace(/[^0-9]/g, " ").trim().split(/\s+/).filter(p => p !== "");
    if (parts.length === 0) return "";
    let year = parts[0];
    if (year.length === 2) year = `20${year}`;
    const y = parseInt(year, 10) || new Date().getFullYear();
    const m = parseInt(parts[1], 10) || 1;
    const d = parseInt(parts[2], 10) || 1;
    return `${y}/${pad(m)}/${pad(d)}`;
}

// #endregion

// #endregion

// #region イベントハンドラ

    // 日常ボタン押下
    function startDaily(key, label) {
        if (state === key && DAILY_KEYS.has(key) && logs.length > 0) {
            let t = now();
            const todayStr = today();
            let last = logs[logs.length - 1];
            if (!last.end) {
                last.end = t;
                last.endDate = todayStr;
            }

            logs.push({
                startDate: todayStr,
                endDate: "",
                type: key,
                start: t,
                end: "",
                important: "",
                note: ""
            });

            save(); renderLog(); renderStats();
            return;
        }

        changeState(key);
    }

    // 作業ボタン押下
    function startCategoryWork(categoryKey, label) { changeState("work", categoryKey, label); }

    // 一時停止ボタン押下
    function pauseTimer() { changeState("paused"); }

    // 休憩ボタン押下
    function startBreak() { changeState("break"); }

    // 作業記録ボタン押下
    function logWork() {
        if (state === "work" && logs.length > 0) {
            let t = now();
            const todayStr = today();
            let last = logs[logs.length - 1];
            if (!last.end) {
                last.end = t;
                last.endDate = todayStr;
            }

            logs.push({
                startDate: todayStr,
                endDate: "",
                type: "work",
                start: t,
                end: "",
                important: last.categoryLabel || last.important || "",
                note: "",
                categoryKey: last.categoryKey || "",
                categoryLabel: last.categoryLabel || last.important || ""
            });

            save(); renderLog(); renderStats();
        }
    }

    // リセットボタン押下
    function resetTimer() {
        if (confirm("本当にリセットしますか？")) {
            logs = [];
            state = "paused";
            contStart = null;
            nextWorkNotificationSeconds = 1500;
            save(); renderLog(); renderStats();
        }
    }

    // CSV出力ボタン押下
    function exportCSV() {
        if (logs.length === 0) { alert("ログがありません。"); return; }
        let header = ["開始日付", "終了日付", "状態", "開始", "終了", "合計", "重要メモ", "メモ"];
        let rows = logs.map((log) => {
            let total = (log.start && log.end) ? format(diffSeconds(log.start, log.end, log.startDate, log.endDate)) : "";
            let typeJP = typeToLabel(log.type, log);

            return [
                log.startDate || "",
                log.endDate || "",
                typeJP,
                log.start || "",
                log.end || "",
                total,
                (log.important || "").replace(/\r?\n/g, ""),
                (log.note || "").replace(/\r?\n/g, "")
            ];
        });

        let csvContent = [header, ...rows].map(e => e.map(v => `"${v}"`).join(",")).join("\r\n");
        let blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        let url = URL.createObjectURL(blob);
        let a = document.createElement("a");
        a.href = url;
        a.download = "work_timer_log.csv";
        a.click();
        URL.revokeObjectURL(url);
    }



    // CSV読込ボタン押下
    function triggerCSVImport() {
        const input = document.getElementById("csvImportInput");
        if (!input) return;
        input.value = "";
        input.click();
    }

    // CSV読込処理（既存ログに追加）
    function importCSV(file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = (event.target?.result || "").toString();
            const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
            if (lines.length < 2) {
                alert("CSVに取り込めるデータがありません。");
                return;
            }

            const header = parseCSVLine(lines[0]);
            const getIndex = (name) => header.findIndex(h => (h || "").trim() === name);

            const idxStartDate = getIndex("開始日付");
            const idxEndDate = getIndex("終了日付");
            const idxType = getIndex("状態");
            const idxStart = getIndex("開始");
            const idxEnd = getIndex("終了");
            const idxImportant = getIndex("重要メモ");
            const idxNote = getIndex("メモ");

            if (idxType === -1 || idxStart === -1) {
                alert("CSVの列が不足しています（状態, 開始 は必須）。");
                return;
            }

            let imported = 0;
            for (let i = 1; i < lines.length; i++) {
                const cols = parseCSVLine(lines[i]);
                const typeLabel = (cols[idxType] || "").trim();
                const mapped = labelToType(typeLabel);

                const newLog = {
                    startDate: normalizeDateInputValue(cols[idxStartDate] || "") || today(),
                    endDate: normalizeDateInputValue(cols[idxEndDate] || ""),
                    type: mapped.type,
                    start: normalizeTimeInputValue(cols[idxStart] || ""),
                    end: normalizeTimeInputValue(cols[idxEnd] || ""),
                    important: (cols[idxImportant] || "").trim(),
                    note: (cols[idxNote] || "").trim()
                };

                if (!newLog.start) continue;
                if (!newLog.endDate && newLog.end) newLog.endDate = newLog.startDate;

                if (mapped.categoryLabel) {
                    newLog.categoryKey = mapped.categoryKey;
                    newLog.categoryLabel = mapped.categoryLabel;
                    if (!newLog.important) newLog.important = mapped.categoryLabel;
                }

                logs.push(newLog);
                imported++;
            }

            if (imported === 0) {
                alert("取り込める行がありませんでした。");
                return;
            }

            save();
            renderLog();
            renderStats();
            alert(`${imported}件のログを追加しました。`);
        };

        reader.readAsText(file, "utf-8");
    }

    function parseCSVLine(line) {
        const result = [];
        let current = "";
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (ch === ',' && !inQuotes) {
                result.push(current);
                current = "";
            } else {
                current += ch;
            }
        }

        result.push(current);
        return result;
    }

    function labelToType(label) {
        const value = (label || "").trim();
        const map = {
            "休憩": { type: "break" },
            "一時停止": { type: "paused" },
            "ゲーム": { type: "game" },
            "お出かけ": { type: "outing" },
            "運動": { type: "exercise" },
            "お仕事": { type: "job" },
            "秘密": { type: "secret" },
            "睡眠": { type: "sleep" },
            "作業": { type: "work", categoryKey: "work", categoryLabel: "作業" }
        };

        if (map[value]) return map[value];

        // 状態が独自ラベルの場合は作業ログとして取り込む
        return { type: "work", categoryKey: "work", categoryLabel: value || "作業" };
    }

    // 左パネル（カテゴリー）折り畳みトグル押下
    function toggleCategory(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.dataset.collapsed = (el.dataset.collapsed === "true") ? "false" : "true";
        save();
    }

    // 右パネル（基本情報）折り畳みトグル押下
    function togglePanel(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.dataset.collapsed = (el.dataset.collapsed === "true") ? "false" : "true";
        save();
    }

// #endregion


// 状態変更処理
function changeState(newState, categoryKey = null, categoryLabel = "") {

    // 同じ状態かつ作業状態でない場合は何もしない（）
    if (state === newState && !(newState === "work" && categoryKey)) return;

    let t = now();
    const todayStr = today();

    if (logs.length > 0 && !logs[logs.length - 1].end) {
        logs[logs.length - 1].end = t;
        logs[logs.length - 1].endDate = todayStr;
    }

    let newLog = {
        startDate: todayStr,
        endDate: "",
        type: newState,
        start: t,
        end: "",
        important: "",
        note: ""
    };

    if (newState === "work" && categoryKey) {
        newLog.categoryKey = categoryKey;
        newLog.categoryLabel = categoryLabel;
        newLog.important = categoryLabel;
    }

    logs.push(newLog);
    state = newState;

    if (newState === "work") {
        contStart = Date.now();
        nextWorkNotificationSeconds = 1500;
    } else {
        contStart = null;
        nextWorkNotificationSeconds = 1500;
    }

    save();
    renderLog();
    renderStats();
}

// 2つの日時文字列の差を秒数で計算
function diffSeconds(start, end, startDate, endDate) {
    const st = parseDateTime(startDate, start);
    let et = parseDateTime(endDate || startDate, end);
    if (!endDate && et < st) {
        et = new Date(et.getTime() + 24 * 60 * 60 * 1000);
    }
    return Math.max(0, Math.floor((et - st) / 1000));
}

// タイプを日本語ラベルに変換
function typeToLabel(t, log) {
    if (t === "work") return log.categoryLabel || log.important || "作業";
    if (t === "break") return "休憩";
    if (t === "paused") return "一時停止";
    if (t === "game") return "ゲーム";
    if (t === "outing") return "お出かけ";
    if (t === "exercise") return "運動";
    if (t === "job") return "お仕事";
    if (t === "secret") return "秘密";
    if (t === "sleep") return "睡眠";
    return t;
}

// 表のドロップダウンから指定した行の状態を更新
function updateLogType(index, newType) {
    const log = logs[index];
    if (!log || !LOG_TYPE_OPTIONS.some(option => option.value === newType)) return;

    log.type = newType;
    if (newType === "work") {
        log.categoryKey = "work";
        log.categoryLabel = "作業";
    } else {
        delete log.categoryKey;
        delete log.categoryLabel;
    }

    // 記録中の最新行を変更した場合は、現在の状態にも反映する
    if (index === logs.length - 1 && !log.end) {
        state = newType;
        contStart = newType === "work" ? Date.now() : null;
        nextWorkNotificationSeconds = 1500;
    }

    save();
    renderLog();
    renderStats();
}

// 指定したログをドラッグ先の位置に移動（記録中の最新ログは移動不可）
function moveLog(sourceIndex, targetIndex) {
    const latestIndex = logs.length - 1;
    const hasActiveLatestLog = latestIndex >= 0 && !logs[latestIndex].end;
    const lastMovableIndex = hasActiveLatestLog ? latestIndex - 1 : latestIndex;

    if (sourceIndex < 0 || sourceIndex > lastMovableIndex
        || targetIndex < 0 || targetIndex > lastMovableIndex
        || sourceIndex === targetIndex) return;

    const [movedLog] = logs.splice(sourceIndex, 1);
    logs.splice(targetIndex, 0, movedLog);
    save();
    renderLog();
    renderStats();
}

// ログ表示更新（下の表の更新（主にボタンを押したときに起動））
function renderLog() {
    let tbody = document.querySelector("#logTable tbody");
    tbody.innerHTML = "";

    // 表の作成
    logs.forEach((log, i) => {

        // 行の作成
        let tr = document.createElement("tr");
        tr.dataset.logIndex = i;

        // 行要素の作成（連番、開始日付、終了日付、状態、開始、終了、合計、重要メモ、メモ）
        let tdRenban = document.createElement("td");
        let tdStartDate = document.createElement("td");
        let tdEndDate = document.createElement("td");
        let tdType = document.createElement("td");
        let tdStart = document.createElement("td");
        let tdEnd = document.createElement("td");
        let tdTotal = document.createElement("td");
        let tdImp = document.createElement("td");
        let tdNote = document.createElement("td");
        let tdDel = document.createElement("td");

        // 行要素の内容設定

        // 連番・日付・状態
        tdRenban.textContent = i + 1;
        const typeSelect = document.createElement("select");
        typeSelect.className = "log-type-select";
        typeSelect.setAttribute("aria-label", `${i + 1}行目の状態`);
        LOG_TYPE_OPTIONS.forEach(({ value, label }) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = label;
            typeSelect.appendChild(option);
        });
        if (!LOG_TYPE_OPTIONS.some(option => option.value === log.type)) {
            const currentOption = document.createElement("option");
            currentOption.value = log.type;
            currentOption.textContent = typeToLabel(log.type, log);
            currentOption.disabled = true;
            typeSelect.prepend(currentOption);
        }
        typeSelect.value = log.type;
        typeSelect.onchange = () => updateLogType(i, typeSelect.value);
        tdType.appendChild(typeSelect);

        // 開始・終了
        if (state === "paused") {
            // 一時停止の場合、開始・終了を編集可能にする
            tdStartDate.textContent = "";
            tdEndDate.textContent = "";
            let inputStartDate = document.createElement("input");
            let inputEndDate = document.createElement("input");
            let inputStart = document.createElement("input");
            let inputEnd = document.createElement("input");
            inputStartDate.type = "text";
            inputEndDate.type = "text";
            inputStart.type = "text";
            inputEnd.type = "text";
            inputStartDate.className = "date-edit col-start-date";
            inputEndDate.className = "date-edit col-end-date";
            inputStart.className = "time-edit col-start";
            inputEnd.className = "time-edit col-end";
            inputStartDate.placeholder = "YYYY/MM/DD";
            inputEndDate.placeholder = "YYYY/MM/DD";
            inputStart.placeholder = "HH:MM:SS";
            inputEnd.placeholder = "HH:MM:SS";
            inputStartDate.value = log.startDate || "";
            inputEndDate.value = log.endDate || "";
            inputStart.value = log.start || "";
            inputEnd.value = log.end || "";
            inputStartDate.onchange = (e) => {
                const v = normalizeDateInputValue(e.target.value);
                logs[i].startDate = v;
                e.target.value = v;
                save(); renderStats();
            };
            inputEndDate.onchange = (e) => {
                const v = normalizeDateInputValue(e.target.value);
                logs[i].endDate = v;
                e.target.value = v;
                save(); renderStats();
            };
            inputStart.onchange = (e) => {
                const v = normalizeTimeInputValue(e.target.value);
                logs[i].start = v;
                e.target.value = v;
                save(); renderStats();
            };
            inputEnd.onchange = (e) => {
                const v = normalizeTimeInputValue(e.target.value);
                logs[i].end = v;
                e.target.value = v;
                save(); renderStats();
            };
            tdStartDate.appendChild(inputStartDate);
            tdEndDate.appendChild(inputEndDate);
            tdStart.appendChild(inputStart);
            tdEnd.appendChild(inputEnd);
        } else {
            // それ以外の場合はラベル表示
            tdStartDate.textContent = log.startDate || today();
            tdEndDate.textContent = log.endDate || "";
            tdStart.textContent = log.start || "";
            tdEnd.textContent = log.end || "";
        }

        // 合計
        tdTotal.textContent = (log.start && log.end) ? format(diffSeconds(log.start, log.end, log.startDate, log.endDate)) : "";

        // 重要メモ
        let textareaImp = document.createElement("textarea");
        textareaImp.className = "important-note";
        textareaImp.value = log.important || "";
        textareaImp.oninput = () => { logs[i].important = textareaImp.value; save(); };
        tdImp.appendChild(textareaImp);

        // メモ
        let textarea = document.createElement("textarea");
        textarea.className = "note";
        textarea.value = log.note || "";
        textarea.oninput = () => { logs[i].note = textarea.value; save(); };
        tdNote.appendChild(textarea);

        // 行移動用のドラッグハンドル（記録中の最新ログは移動不可）
        const latestIndex = logs.length - 1;
        const hasActiveLatestLog = latestIndex >= 0 && !logs[latestIndex].end;
        const isActiveLatestLog = hasActiveLatestLog && i === latestIndex;

        let actionButtons = document.createElement("div");
        actionButtons.className = "log-action-buttons";

        let dragHandle = document.createElement("span");
        dragHandle.textContent = "☰";
        dragHandle.className = "drag-handle";
        dragHandle.title = isActiveLatestLog ? "記録中の行は移動できません" : "ドラッグして行を移動";
        dragHandle.setAttribute("aria-label", dragHandle.title);
        dragHandle.draggable = !isActiveLatestLog;

        if (isActiveLatestLog) {
            dragHandle.classList.add("disabled");
        } else {
            dragHandle.addEventListener("dragstart", (event) => {
                draggedLogIndex = i;
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", String(i));
                tr.classList.add("dragging");
            });
            dragHandle.addEventListener("dragend", () => {
                draggedLogIndex = null;
                tr.classList.remove("dragging");
                tbody.querySelectorAll(".drag-over").forEach(row => row.classList.remove("drag-over"));
            });

            tr.addEventListener("dragover", (event) => {
                if (!Number.isInteger(draggedLogIndex) || draggedLogIndex === i) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                tr.classList.add("drag-over");
            });
            tr.addEventListener("dragleave", () => tr.classList.remove("drag-over"));
            tr.addEventListener("drop", (event) => {
                event.preventDefault();
                tr.classList.remove("drag-over");
                const sourceIndex = draggedLogIndex;
                if (Number.isInteger(sourceIndex)) moveLog(sourceIndex, i);
            });
        }

        actionButtons.appendChild(dragHandle);

        // 削除ボタン
        let delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.textContent = "削除";
        delBtn.className = "btn-delete";
        delBtn.onclick = () => {
            const wasDeletingLastOpen = (i === logs.length - 1) && !logs[i].end;
            logs.splice(i, 1);
            if (logs.length === 0 || wasDeletingLastOpen) {
                state = "paused";
                contStart = null;
                nextWorkNotificationSeconds = 1500;
            }
            save();
            renderLog();
            renderStats();
        };
        actionButtons.appendChild(delBtn);
        tdDel.appendChild(actionButtons);

        // 行要素を行に追加
        tr.appendChild(tdRenban);
        tr.appendChild(tdStartDate);
        tr.appendChild(tdEndDate);
        tr.appendChild(tdType);
        tr.appendChild(tdStart);
        tr.appendChild(tdEnd);
        tr.appendChild(tdTotal);
        tr.appendChild(tdImp);
        tr.appendChild(tdNote);
        tr.appendChild(tdDel);

        // 行を表に追加
        tbody.appendChild(tr);
    });
}

// 統計表示更新(基本情報は常に更新)
function renderStats() {
    let statusText;
    if (state === "work") statusText = "作業";
    else if (DAILY_KEYS.has(state)) statusText = typeToLabel(state, {});
    else statusText = typeToLabel(state, {});
    document.getElementById("status").textContent = statusText;

    let totalWork = 0, totalBreak = 0, totalPaused = 0;

    let totalsDaily = {
        game: 0, outing: 0, exercise: 0, job: 0, secret: 0, sleep: 0
    };

    logs.forEach(log => {
        if (!log.start) return;

        let diff;
        if (log.end) diff = diffSeconds(log.start, log.end, log.startDate, log.endDate);
        else {
            const st = parseDateTime(log.startDate, log.start);
            diff = Math.floor((Date.now() - st.getTime()) / 1000);
            if (diff < 0) diff = 0;
        }

        if (log.type === "work") {
            totalWork += diff;
        } else if (log.type === "break") {
            totalBreak += diff;
        } else if (log.type === "paused") {
            totalPaused += diff;
        } else if (DAILY_KEYS.has(log.type)) {
            totalsDaily[log.type] += diff;
        }
    });

    document.getElementById("totalWork").textContent = format(totalWork);
    document.getElementById("totalBreak").textContent = format(totalBreak);
    document.getElementById("totalPaused").textContent = format(totalPaused);

    document.getElementById("totalGame").textContent = format(totalsDaily.game);
    document.getElementById("totalOuting").textContent = format(totalsDaily.outing);
    document.getElementById("totalExercise").textContent = format(totalsDaily.exercise);
    document.getElementById("totalJob").textContent = format(totalsDaily.job);
    document.getElementById("totalSecret").textContent = format(totalsDaily.secret);
    document.getElementById("totalSleep").textContent = format(totalsDaily.sleep);

    let cont = 0;
    if (state === "work" && contStart) {
        cont = Math.floor((Date.now() - contStart) / 1000);
        while (cont >= nextWorkNotificationSeconds) {
            showWorkNotification();
            nextWorkNotificationSeconds += 1500;
        }
    }
    document.getElementById("contWork").textContent = format(cont);

    // 作業は5秒ごと、お仕事は30秒ごとに休憩時間を1秒獲得する
    let totalRest = Math.floor(totalWork / REST_EARNING_INTERVAL_SECONDS.work)
        + Math.floor(totalsDaily.job / REST_EARNING_INTERVAL_SECONDS.job);
    let bonusBlocks = Math.floor(totalWork / (100 * 60));
    totalRest += bonusBlocks * (30 * 60);

    let fourHourBlocks = Math.floor(totalWork / (4 * 60 * 60));

    totalRest += fourHourBlocks * (30 * 60);

    // 休憩は1秒、睡眠は15秒、一時停止は5秒の経過ごとに権利を1秒消費する
    const usedRest = Math.floor(totalBreak / REST_USAGE_INTERVAL_SECONDS.break)
        + Math.floor(totalsDaily.sleep / REST_USAGE_INTERVAL_SECONDS.sleep)
        + Math.floor(totalPaused / REST_USAGE_INTERVAL_SECONDS.paused);
    let remain = totalRest - usedRest;
    document.getElementById("totalRest").textContent = format(Math.floor(remain));
    document.getElementById("remainRest").textContent = format(Math.floor(remain));

}

/// 保存
function save() {


    localStorage.setItem("workTimerLogs", JSON.stringify(logs));
    localStorage.setItem("workTimerState", state);

    ["cat-daily", "cat-work"].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        localStorage.setItem("workTimerCollapse_" + id, el.dataset.collapsed === "true" ? "1" : "0");
    });

    ["panel-basic", "panel-switch"].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        localStorage.setItem("workTimerPanel_" + id, el.dataset.collapsed === "true" ? "1" : "0");
    });
}

// 読み込み
function load() {
    let l = localStorage.getItem("workTimerLogs");
    if (l) {
        logs = JSON.parse(l).map(log => {
            if (!log.startDate && log.date) log.startDate = log.date;
            if (!log.startDate) log.startDate = today();
            if (!log.endDate && log.end) log.endDate = log.startDate;
            return log;
        });
    }

    let s = localStorage.getItem("workTimerState");
    if (s) state = s;

    ["cat-daily", "cat-work"].forEach(id => {
        const v = localStorage.getItem("workTimerCollapse_" + id);
        if (v === null) return;
        const el = document.getElementById(id);
        if (!el) return;
        el.dataset.collapsed = (v === "1") ? "true" : "false";
    });

    ["panel-basic", "panel-switch"].forEach(id => {
        const v = localStorage.getItem("workTimerPanel_" + id);
        if (v === null) return;
        const el = document.getElementById(id);
        if (!el) return;
        el.dataset.collapsed = (v === "1") ? "true" : "false";
    });
}

// ウィンドウ閉じる前の確認
window.addEventListener("beforeunload", function (e) {
    e.preventDefault();
    e.returnValue = "閉じますか？記録は保存されますが進行中の作業は止まります。";
});

// 通知許可リクエスト
if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
}

const csvImportInput = document.getElementById("csvImportInput");
if (csvImportInput) {
    csvImportInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) importCSV(file);
    });
}

load();
renderLog();
renderStats();
setInterval(() => { renderStats(); }, 1000);
