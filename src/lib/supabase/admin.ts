import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Bypasses Row Level Security entirely — the service role key has full
// database access. Only use this inside "use server" actions that have
// already confirmed the caller is an admin (see assertAdmin() in
// src/app/admin/*/actions.ts). Never import this into a Client Component
// or any code path reachable from the browser.
export function createAdminClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
