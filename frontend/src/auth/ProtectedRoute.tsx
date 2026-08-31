import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import { useAuth, type UserRole } from "@/auth/AuthContext";
import { PageLoading } from "@/components/PageLoading";

interface ContractorProfile {
  verification_status: string;
  is_suspended: boolean;
}

// Mirrors src/middleware.ts: must be logged in, must have the matching
// role, and — for the contractor-gated paths (feed/subscribe/offer) —
// must currently be an approved, non-suspended contractor. Re-checked on
// every route entry rather than cached, since an admin can flip either
// flag at any time.
export function ProtectedRoute({
  role,
  gate = false,
  children,
}: {
  role: UserRole;
  gate?: boolean;
  children: ReactNode;
}) {
  const { user, loading } = useAuth();

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["contractor-profile-gate"],
    queryFn: () => apiFetch<ContractorProfile>("/contractor/profile"),
    enabled: gate && !!user && user.role === "contractor",
  });

  if (loading) return <PageLoading />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to="/" replace />;

  if (gate && role === "contractor") {
    if (profileLoading) return <PageLoading />;
    if (!profile || profile.verification_status !== "approved" || profile.is_suspended) {
      return <Navigate to="/contractor/status" replace />;
    }
  }

  return <>{children}</>;
}
