import { signIn, getUser, insertSession } from "./db.js";
import { supabase } from "./supabaseClient.js";

function qs(id) { return document.getElementById(id); }

function setMsg(text, isError = false) {
  const el = qs("authMessage");
  el.textContent = text || "";
  el.style.color = isError ? "#ffb3b3" : "#ddd";
}

function setStatus(user) {
  qs("authStatus").textContent = user ? "ログイン中" : "未ログイン";
  qs("authUid").textContent = user ? user.id : "-";
}

// ログイン画面の表示
function showAuthPanel(show) {
  qs("authPanel").style.display = show ? "block" : "none";
  qs("authOpenBtn").style.display = show ? "none" : "block";
}

// ログインステータスの初期化？
async function refreshAuthState() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    setMsg(error.message, true);
    setStatus(null);
    return null;
  }
  setStatus(user);
  return user;
}

// 初期表示のログイン画面
async function initAuthUI() {
  // 初期表示
  showAuthPanel(false);
  setMsg("");

  qs("authOpenBtn").addEventListener("click", () => showAuthPanel(true));
  qs("authCloseBtn").addEventListener("click", () => showAuthPanel(false));

  qs("signInBtn").addEventListener("click", async () => {
    try {
      setMsg("ログイン中…");
      const email = qs("authEmail").value.trim();
      const password = qs("authPassword").value;
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const user = await refreshAuthState();
      setMsg("ログイン成功っす。");
      showAuthPanel(false);

      // ここでDBロードなどを呼ぶ（後で差し込み）
      // await loadSessions(user);

    } catch (e) {
      setMsg(e.message || String(e), true);
    }
  });

  qs("signUpBtn").addEventListener("click", async () => {
    try {
      setMsg("登録中…（確認メールが必要な設定の場合はメールを確認）");
      const email = qs("authEmail").value.trim();
      const password = qs("authPassword").value;
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      await refreshAuthState();
      setMsg("登録要求を送ったっす。メール確認が必要なら届いたメールを確認してログインするっす。");
    } catch (e) {
      setMsg(e.message || String(e), true);
    }
  });

  qs("signOutBtn").addEventListener("click", async () => {
    try {
      setMsg("ログアウト中…");
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      await refreshAuthState();
      setMsg("ログアウトしたっす。");
      // 必要ならUI側の履歴表示もクリアする
    } catch (e) {
      setMsg(e.message || String(e), true);
    }
  });

  qs("forgotBtn").addEventListener("click", async () => {
    try {
      const email = qs("authEmail").value.trim();
      if (!email) {
        setMsg("メールアドレスを入れてから押してほしいっす。", true);
        return;
      }
      setMsg("再設定メール送信中…");
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      setMsg("再設定メールを送ったっす。受信箱を確認してほしいっす。");
    } catch (e) {
      setMsg(e.message || String(e), true);
    }
  });

  // 起動時にログイン状態を反映
  const user = await refreshAuthState();
  if (!user) {
    // 未ログインならパネルを出してもいい
    // showAuthPanel(true);
  }

  // ログイン状態の変化を追跡（別タブでログイン/ログアウトしても追従）
  supabase.auth.onAuthStateChange(async (_event, session) => {
    setStatus(session?.user ?? null);
  });
}

// 例：起動時にログイン（まずは簡単に固定フォーム等で）
async function boot() {
  // TODO: ここはUIフォームから取るのが本番っす
  // await signIn(email, password);
  document.addEventListener("DOMContentLoaded", async () => {
  await initAuthUI();

  // ここから先は元のPomoTimer初期化
  // initTimerUI();
  // bindButtons();
});

}

boot();

async function saveOneSessionExample() {
  const user = await getUser();

  const start_at = new Date().toISOString();
  const end_at = new Date(Date.now() + 25 * 60 * 1000).toISOString();

  await insertSession({
    user_id: user.id,     // RLSで必須になりがち
    type: "work",
    start_at,
    end_at,
    duration_sec: 25 * 60
  });
}



let state = "paused";
let logs = [];
let contStart = null;
let notified = false;

const DAILY_KEYS = new Set(["game", "outing", "exercise", "job", "secret", "sleep"]);

// #region プライベート

// #region 計算

// 時間表示用ゼロパディング
function pad(n) { return String(n).padStart(2, '0'); }

// 秒数をHH:MM:SS形式に変換
function format(t) {
    let h = Math.floor(t / 3600);
    let m = Math.floor((t % 3600) / 60);
    let s = t % 60;
    return pad(h) + ":" + pad(m) + ":" + pad(s);
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
            notified = false;
            save(); renderLog(); renderStats();
        }
    }

    // CSV出力ボタン押下
    function exportCSV() {
        if (logs.length === 0) { alert("ログがありません。"); return; }
        let header = ["連番", "開始日付", "終了日付", "状態", "開始", "終了", "合計", "重要メモ", "メモ"];
        let rows = logs.map((log, i) => {
            let total = (log.start && log.end) ? format(diffSeconds(log.start, log.end, log.startDate, log.endDate)) : "";
            let typeJP = typeToLabel(log.type, log);

            return [
                i + 1,
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
        notified = false;
    } else {
        contStart = null;
        notified = false;
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

// ログ表示更新（下の表の更新（主にボタンを押したときに起動））
function renderLog() {
    let tbody = document.querySelector("#logTable tbody");
    tbody.innerHTML = "";

    // 表の作成
    logs.forEach((log, i) => {

        // 行の作成
        let tr = document.createElement("tr");

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
        tdType.textContent = typeToLabel(log.type, log);

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

        // 削除ボタン
        let delBtn = document.createElement("button");
        delBtn.textContent = "削除";
        delBtn.className = "btn-delete";
        delBtn.onclick = () => {
            const wasDeletingLastOpen = (i === logs.length - 1) && !logs[i].end;
            logs.splice(i, 1);
            if (logs.length === 0 || wasDeletingLastOpen) {
                state = "paused";
                contStart = null;
                notified = false;
            }
            save();
            renderLog();
            renderStats();
        };
        tdDel.appendChild(delBtn);

        // 行要素を行に追加
        tr.appendChild(tdRenban);
        tr.appendChild(tdType);
        tr.appendChild(tdStartDate);
        tr.appendChild(tdStart);
        tr.appendChild(tdEndDate);
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
        if (cont >= 1500 && !notified) {
            if (Notification.permission === "granted") {
                new Notification("休憩しましょう！", { body: "25分作業しました ☕" });
            }
            notified = true;
        }
    }
    document.getElementById("contWork").textContent = format(cont);

    let totalRest = totalWork * 12 / 60;
    let bonusBlocks = Math.floor(totalWork / (100 * 60));
    totalRest += bonusBlocks * (30 * 60);

    let fourHourBlocks = Math.floor(totalWork / (4 * 60 * 60));

    totalRest += fourHourBlocks * (30 * 60);
    document.getElementById("totalRest").textContent = format(Math.floor(totalRest));

    let remain = totalRest - totalBreak;
    if (remain < 0) remain = 0;
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

load();
renderLog();
renderStats();
setInterval(() => { renderStats(); }, 1000);

window.startBreak = startBreak;
window.pauseTimer = pauseTimer;
window.resetTimer = resetTimer;
window.startDaily = startDaily;
window.startCategoryWork = startCategoryWork;
window.logWork = logWork;
window.exportCSV = exportCSV;
window.toggleCategory = toggleCategory;
window.togglePanel = togglePanel;