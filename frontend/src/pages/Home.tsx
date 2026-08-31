import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";

export function HomePage() {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (user) {
    if (user.role === "admin") return <Navigate to="/admin/requirements" replace />;
    if (user.role === "owner") return <Navigate to="/owner/dashboard" replace />;
    // middleware forwards on to /feed once approved
    return <Navigate to="/contractor/verify" replace />;
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
          to="/login"
          className="border border-navy text-navy hover:bg-navy hover:text-white text-sm font-semibold rounded px-5 py-2.5"
        >
          Log in
        </Link>
        <Link to="/signup" className="bg-amber hover:bg-amber-dark text-white text-sm font-semibold rounded px-5 py-2.5">
          Sign up
        </Link>
      </div>
    </main>
  );
}
