import { createBrowserClient } from "@supabase/ssr";

// Used in Client Components. Reads the public (anon) key only —
// safe to ship to the browser because Row Level Security enforces
// what each authenticated user can actually read/write.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
