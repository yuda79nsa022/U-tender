import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function RootPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

    if (profile?.role === "admin") redirect("/admin/requirements");
    if (profile?.role === "owner") redirect("/owner/dashboard");
    if (profile?.role === "contractor") redirect("/contractor/verify"); // middleware forwards on to /feed once approved
  }

  return (
    <main className="max-w-md mx-auto px-5 py-24 text-center">
      <div className="w-10 h-10 border-2 border-navy flex items-center justify-center font-display font-bold text-lg text-navy mx-auto mb-4">
        U
      </div>
      <h1 className="font-display text-2xl font-semibold text-navy mb-2">U-Tender</h1>
      <p className="text-sm text-steel mb-8">Drawings in. Offers out.</p>

      <div className="flex items-center justify-center gap-3">
        <Link
          href="/login"
          className="border border-navy text-navy hover:bg-navy hover:text-white text-sm font-semibold rounded px-5 py-2.5"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="bg-amber hover:bg-amber-dark text-white text-sm font-semibold rounded px-5 py-2.5"
        >
          Sign up
        </Link>
      </div>
    </main>
  );
}
