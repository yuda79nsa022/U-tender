import { Outlet } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";

export function ContractorLayout() {
  return (
    <div className="min-h-screen">
      <AppHeader roleLabel="Contractor" homeHref="/contractor/feed" />
      <Outlet />
    </div>
  );
}
