import { supabase } from "./supabaseClient.js";

/** ログイン（Email/Password） */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

/** 今ログイン中のユーザー取得 */
export async function getUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}

/** 1セッション保存（追加） */
export async function insertSession(session) {
  // insertはデフォで返ってこないので .select() を付けるのがv2流儀っす
  const { data, error } = await supabase
    .from("M_Timer")
    .insert([session])
    .select();
  if (error) throw error;
  return data;
}

/** 既存行を更新（id指定） */
export async function updateSession(id, patch) {
  const { data, error } = await supabase
    .from("M_Timer")
    .update(patch)
    .eq("id", id)
    .select();
  if (error) throw error;
  return data;
}

/** あれば更新・なければ追加（upsert） */
export async function upsertSession(session, onConflict = "id") {
  const { data, error } = await supabase
    .from("M_Timer")
    .upsert(session, { onConflict })
    .select();
  if (error) throw error;
  return data;
}

/** 最新ログ取得 */
export async function fetchLatestSessions(limit = 50) {
  const { data, error } = await supabase
    .from("M_Timer")
    .select("*")
    .order("start_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}
