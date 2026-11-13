// Supabase dashboard > Project Settings > API
// The publishable key is meant to be public. NEVER put the secret / service_role key or the Gemini key in here.
const SUPABASE_URL = "https://yymyopuyyyzfvxgljvbv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_XXY0zyTPyX2hiCis7cEFWA_NAqOIsBP";

const CHAT_URL = `${SUPABASE_URL}/functions/v1/chat`;

// Single admin account; only the password is typed in.
const ADMIN_EMAIL = "admin@salerno-ai.app";

// true = the chat needs the admin password too (must match REQUIRE_LOGIN in the chat Edge Function)
const REQUIRE_LOGIN = true;
