import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { ApiError } from "@/api/client";

function RoleFields({
  role,
  setRole,
}: {
  role: "owner" | "contractor";
  setRole: (r: "owner" | "contractor") => void;
}) {
  return (
    <>
      <div>
        <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1.5">I am a...</label>
        <div className="flex border border-navy rounded overflow-hidden w-fit">
          <button
            type="button"
            onClick={() => setRole("owner")}
            className={`px-4 py-2 text-xs font-mono uppercase ${role === "owner" ? "bg-navy text-white" : "bg-white text-navy"}`}
          >
            Property owner
          </button>
          <button
            type="button"
            onClick={() => setRole("contractor")}
            className={`px-4 py-2 text-xs font-mono uppercase border-l border-navy ${role === "contractor" ? "bg-navy text-white" : "bg-white text-navy"}`}
          >
            Contractor
          </button>
        </div>
      </div>

      {role === "contractor" && (
        <div>
          <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1">Company name</label>
          <input name="company_name" required className="w-full border border-border rounded px-3 py-2.5 text-sm" />
          <p className="text-xs text-steel-light mt-1">You'll submit verification documents after signing up.</p>
        </div>
      )}
    </>
  );
}

export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState<"owner" | "contractor">("owner");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    try {
      await signup({
        email: form.get("email") as string,
        password: form.get("password") as string,
        full_name: form.get("full_name") as string,
        role,
        company_name: (form.get("company_name") as string) || undefined,
      });
      navigate(role === "owner" ? "/owner/dashboard" : "/contractor/verify");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Could not create account.");
    } finally {
      setPending(false);
    }
  }

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

      <h1 className="font-display text-xl font-semibold text-navy mb-6">Create an account</h1>

      {error && <p className="text-xs bg-red-tint text-red border border-red rounded px-3 py-2.5 mb-4">{error}</p>}

      <form onSubmit={handleSubmit} className="grid gap-4">
        <RoleFields role={role} setRole={setRole} />

        <div>
          <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1">Full name</label>
          <input name="full_name" required className="w-full border border-border rounded px-3 py-2.5 text-sm" />
        </div>
        <div>
          <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1">Email</label>
          <input type="email" name="email" required className="w-full border border-border rounded px-3 py-2.5 text-sm" />
        </div>
        <div>
          <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1">Password</label>
          <input
            type="password"
            name="password"
            required
            minLength={8}
            className="w-full border border-border rounded px-3 py-2.5 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="bg-amber hover:bg-amber-dark disabled:opacity-60 text-white font-semibold text-sm rounded px-5 py-2.5 mt-2"
        >
          {pending ? "Creating…" : "Create account"}
        </button>
      </form>

      <p className="text-xs text-steel mt-6">
        Already have an account?{" "}
        <Link to="/login" className="text-navy underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
