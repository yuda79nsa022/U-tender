import { AppHeader } from "@/components/app-header";

export default function ContractorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <AppHeader roleLabel="Contractor" homeHref="/contractor/feed" />
      {children}
    </div>
  );
}
