import { AppHeader } from "@/components/app-header";
import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <AppHeader roleLabel="Site Admin" homeHref="/admin/requirements" />
      <div className="max-w-5xl mx-auto px-5 pt-4 flex gap-4">
        <Link href="/admin/requirements" className="font-mono text-xs uppercase tracking-wide text-steel hover:text-navy">
          Document requirements
        </Link>
        <Link href="/admin/review" className="font-mono text-xs uppercase tracking-wide text-steel hover:text-navy">
          Review applications
        </Link>
        <Link href="/admin/contractors" className="font-mono text-xs uppercase tracking-wide text-steel hover:text-navy">
          All contractors
        </Link>
      </div>
      {children}
    </div>
  );
}
