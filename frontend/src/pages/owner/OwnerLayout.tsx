import { Outlet } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";

export function OwnerLayout() {
  return (
    <div className="min-h-screen">
      <AppHeader roleLabel="Owner" homeHref="/owner/dashboard" />
      <Outlet />
    </div>
  );
}
