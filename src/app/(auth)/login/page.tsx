import { login } from "../actions";
import Link from "next/link";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; notice?: string };
}) {
  return (
    <main className="max-w-sm mx-auto px-5 py-16">
      <div className="flex items-center gap-2.5 mb-10">
        <div className="w-7 h-7 border-2 border-navy flex items-center justify-center font-display font-bold text-sm text-navy">
          U
        </div>
        <div>
          <div className="font-display font-bold text-lg text-navy leading-none">U-TENDER</div>
          <div className="text-[10px] text-steel uppercase tracking-widest">Drawings in. Offers out.</div>
        </div>
      </div>

      <h1 className="font-display text-xl font-semibold text-navy mb-6">Log in</h1>

      {searchParams.notice && (
        <p className="text-xs bg-blue-tint text-blue border border-blue rounded px-3 py-2.5 mb-4">
          {searchParams.notice}
        </p>
      )}
      {searchParams.error && (
        <p className="text-xs bg-red-tint text-red border border-red rounded px-3 py-2.5 mb-4">
          {searchParams.error}
        </p>
      )}

      <form action={login} className="grid gap-4">
        <div>
          <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1">Email</label>
          <input
            type="email"
            name="email"
            required
            className="w-full border border-border rounded px-3 py-2.5 text-sm"
          />
        </div>
        <div>
          <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1">Password</label>
          <input
            type="password"
            name="password"
            required
            className="w-full border border-border rounded px-3 py-2.5 text-sm"
          />
        </div>
        <button
          type="submit"
          className="bg-amber hover:bg-amber-dark text-white font-semibold text-sm rounded px-5 py-2.5 mt-2"
        >
          Log in
        </button>
      </form>

      <p className="text-xs text-steel mt-6">
        No account?{" "}
        <Link href="/signup" className="text-navy underline">
          Sign up
        </Link>
      </p>
    </main>
  );
}
