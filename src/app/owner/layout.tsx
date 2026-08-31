import { AppHeader } from "@/components/app-header";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <AppHeader roleLabel="Owner" homeHref="/owner/dashboard" />
      {children}
    </div>
  );
}
