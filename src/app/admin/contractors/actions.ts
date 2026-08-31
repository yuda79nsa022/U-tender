"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function assertAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") throw new Error("Admin access required");

  return { supabase, adminId: user.id };
}

export async function updateContractorProfile(formData: FormData) {
  const { supabase } = await assertAdmin();

  const contractorId = formData.get("contractor_id") as string;
  const companyName = formData.get("company_name") as string;
  const licenseNumber = formData.get("license_number") as string;
  const primaryTrade = formData.get("primary_trade") as string;
  const serviceArea = formData.get("service_area") as string;

  if (!companyName?.trim()) throw new Error("Company name is required.");

  const { error } = await supabase
    .from("contractor_profiles")
    .update({
      company_name: companyName.trim(),
      license_number: licenseNumber || null,
      primary_trade: primaryTrade || null,
      service_area: serviceArea || null,
    })
    .eq("user_id", contractorId);

  if (error) throw error;

  revalidatePath(`/admin/contractors/${contractorId}`);
  revalidatePath("/admin/contractors");
}

export async function setVerificationStatus(contractorId: string, status: string) {
  const { supabase } = await assertAdmin();

  const { error } = await supabase
    .from("contractor_profiles")
    .update({ verification_status: status })
    .eq("user_id", contractorId);

  if (error) throw error;

  revalidatePath(`/admin/contractors/${contractorId}`);
  revalidatePath("/admin/contractors");
  revalidatePath("/admin/review");
  revalidatePath("/contractor/status");
}

export async function setSuspended(contractorId: string, suspended: boolean) {
  const { supabase } = await assertAdmin();

  const { error } = await supabase
    .from("contractor_profiles")
    .update({ is_suspended: suspended })
    .eq("user_id", contractorId);

  if (error) throw error;

  revalidatePath(`/admin/contractors/${contractorId}`);
  revalidatePath("/admin/contractors");
  revalidatePath("/contractor/status");
}

// Permanently removes the contractor's auth account, which cascades
// through profiles → contractor_profiles → contractor_documents/offers
// via the FK constraints in schema.sql. Blocked if the contractor has any
// reviews on record — those are part of the platform's public reputation
// history and reviews.contractor_id has no ON DELETE CASCADE by design,
// so a hard delete would otherwise fail with a foreign-key violation.
// Suspend instead if you need to preserve that history while cutting
// access.
export async function deleteContractor(contractorId: string) {
  const { supabase } = await assertAdmin();

  const { count: reviewCount } = await supabase
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("contractor_id", contractorId);

  if (reviewCount && reviewCount > 0) {
    throw new Error(
      "This contractor has completed projects with reviews on record. Suspend the account instead of deleting it, to keep that history intact."
    );
  }

  // Best-effort cleanup of their uploaded document files — the DB rows
  // are removed automatically by the cascade below, but storage objects
  // are not. Use the file_path values already on record rather than
  // listing the bucket, since uploads are nested under
  // `${contractorId}/${requirementId}/...` and list() only returns one
  // level at a time.
  const { data: docsWithFiles } = await supabase
    .from("contractor_documents")
    .select("file_path")
    .eq("contractor_id", contractorId)
    .not("file_path", "is", null);

  const admin = createAdminClient();
  const paths = (docsWithFiles ?? []).map((d) => d.file_path).filter(Boolean) as string[];
  if (paths.length) {
    await admin.storage.from("contractor-documents").remove(paths);
  }

  const { error } = await admin.auth.admin.deleteUser(contractorId);
  if (error) throw error;

  revalidatePath("/admin/contractors");
  redirect("/admin/contractors");
}
