import { NavLink, Outlet } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";

const navClass = ({ isActive }: { isActive: boolean }) =>
  `font-mono text-xs uppercase tracking-wide ${isActive ? "text-navy" : "text-steel hover:text-navy"}`;

export function AdminLayout() {
  return (
    <div className="min-h-screen">
      <AppHeader roleLabel="Site Admin" homeHref="/admin/requirements" />
      <div className="max-w-5xl mx-auto px-5 pt-4 flex gap-4">
        <NavLink to="/admin/requirements" className={navClass}>
          Document requirements
        </NavLink>
        <NavLink to="/admin/review" className={navClass}>
          Review applications
        </NavLink>
        <NavLink to="/admin/contractors" className={navClass}>
          All contractors
        </NavLink>
        <NavLink to="/admin/cms" className={navClass}>
          Website content
        </NavLink>
      </div>
      <Outlet />
    </div>
  );
}
