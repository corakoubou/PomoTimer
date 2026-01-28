import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://ovlvypxbkbxjvznengwj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_8PuUlS7lSujTCXzjzvnAcQ_Kz5dnHWn";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
