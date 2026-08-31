import { createClient } from "@/lib/supabase/server";
import { uploadDocument, submitForReview } from "./actions";
import { redirect } from "next/navigation";

export default async function VerifyPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: requirements } = await supabase
    .from("document_requirements")
    .select("*")
    .eq("is_active", true)
    .order("is_required", { ascending: false });

  const { data: docs } = await supabase
    .from("contractor_documents")
    .select("*")
    .eq("contractor_id", user.id);

  const statusFor = (requirementId: string) =>
    docs?.find((d) => d.requirement_id === requirementId)?.status ?? "not_submitted";

  return (
    <main className="max-w-4xl mx-auto px-5 py-10">
      <span className="font-mono text-[11px] uppercase tracking-widest text-amber-dark block mb-2">
        Contractor · Account verification
      </span>
      <h1 className="font-display text-2xl font-semibold text-navy mb-2">Verify your company</h1>
      <p className="text-sm text-steel mb-8">
        Submit the documents below so a site admin can activate your account.
      </p>

      <form
        action={async (formData) => {
          "use server";
          await submitForReview(
            formData.get("company_name") as string,
            formData.get("license_number") as string
          );
          redirect("/contractor/status");
        }}
        className="mb-10 grid gap-4 max-w-md"
      >
        <div>
          <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1">
            Company name
          </label>
          <input name="company_name" required className="w-full border border-border rounded px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1">
            License number
          </label>
          <input name="license_number" className="w-full border border-border rounded px-3 py-2 text-sm" />
        </div>

        <table className="w-full border-collapse mt-4">
          <thead>
            <tr className="text-left">
              <th className="font-mono text-[10px] uppercase text-steel border-b-2 border-navy py-2">Document</th>
              <th className="font-mono text-[10px] uppercase text-steel border-b-2 border-navy py-2">Status</th>
              <th className="border-b-2 border-navy py-2"></th>
            </tr>
          </thead>
          <tbody>
            {requirements?.map((req) => (
              <tr key={req.id} className="border-b border-border">
                <td className="py-3">
                  <div className="font-display font-semibold text-sm">{req.name}</div>
                  <div className="text-xs text-steel-light">{req.description}</div>
                  <span className="font-mono text-[9.5px] uppercase text-steel-light">
                    {req.is_required ? "Required" : "Optional"}
                  </span>
                </td>
                <td className="py-3 font-mono text-xs capitalize">{statusFor(req.id).replace("_", " ")}</td>
                <td className="py-3">
                  <UploadControl requirementId={req.id} action={uploadDocument} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button
          type="submit"
          className="mt-4 bg-amber hover:bg-amber-dark text-white font-semibold text-sm rounded px-5 py-2.5 w-fit"
        >
          Submit for review
        </button>
      </form>
    </main>
  );
}

function UploadControl({
  requirementId,
  action,
}: {
  requirementId: string;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="requirement_id" value={requirementId} />
      <input type="file" name="file" required className="text-xs" />
      <button
        type="submit"
        className="border border-navy text-navy hover:bg-navy hover:text-white text-xs font-semibold rounded px-3 py-1.5"
      >
        Upload
      </button>
    </form>
  );
}
