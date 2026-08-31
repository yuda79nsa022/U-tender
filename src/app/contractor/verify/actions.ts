"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Called once when a contractor account is first created, so every
// active requirement gets a "not_submitted" row to track against.
export async function ensureDocumentRows(contractorId: string) {
  const supabase = createClient();

  const { data: requirements } = await supabase
    .from("document_requirements")
    .select("id")
    .eq("is_active", true);

  if (!requirements?.length) return;

  const rows = requirements.map((r) => ({
    contractor_id: contractorId,
    requirement_id: r.id,
    status: "not_submitted" as const,
  }));

  // upsert so re-running this never duplicates a row
  await supabase.from("contractor_documents").upsert(rows, {
    onConflict: "contractor_id,requirement_id",
    ignoreDuplicates: true,
  });
}

export async function uploadDocument(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const requirementId = formData.get("requirement_id") as string;
  const file = formData.get("file") as File;
  if (!file || file.size === 0) throw new Error("No file provided");

  const path = `${user.id}/${requirementId}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from("contractor-documents") // private bucket — create in Supabase dashboard
    .upload(path, file);

  if (uploadError) throw uploadError;

  const { error: dbError } = await supabase
    .from("contractor_documents")
    .update({
      file_path: path,
      status: "pending",
      submitted_at: new Date().toISOString(),
      admin_note: null, // clear any prior rejection note on re-upload
    })
    .eq("contractor_id", user.id)
    .eq("requirement_id", requirementId);

  if (dbError) throw dbError;

  revalidatePath("/contractor/verify");
  revalidatePath("/contractor/status");
}

export async function submitForReview(companyName: string, licenseNumber: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Guard: every *required* document must be at least "pending" (uploaded)
  const { data: docs } = await supabase
    .from("contractor_documents")
    .select("status, document_requirements(is_required)")
    .eq("contractor_id", user.id);

  const missingRequired = docs?.some(
    (d: any) => d.document_requirements?.is_required && d.status === "not_submitted"
  );
  if (missingRequired) {
    throw new Error("All required documents must be uploaded before submitting for review.");
  }

  const { error } = await supabase
    .from("contractor_profiles")
    .update({
      company_name: companyName,
      license_number: licenseNumber,
      verification_status: "pending_review",
    })
    .eq("user_id", user.id);

  if (error) throw error;

  revalidatePath("/contractor/status");
}
