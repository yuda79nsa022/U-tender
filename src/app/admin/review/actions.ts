"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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

export async function reviewDocument(formData: FormData) {
  const { supabase, adminId } = await assertAdmin();

  const contractorId = formData.get("contractor_id") as string;
  const requirementId = formData.get("requirement_id") as string;
  const decision = formData.get("decision") as "approved" | "rejected";
  const note = formData.get("note") as string;

  const { error } = await supabase
    .from("contractor_documents")
    .update({
      status: decision,
      admin_note: decision === "rejected" ? note || "Document rejected — please re-upload." : null,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("contractor_id", contractorId)
    .eq("requirement_id", requirementId);

  if (error) throw error;

  // A single rejected document sends the whole application back to
  // "changes requested" immediately, so the contractor sees it without
  // the admin needing a separate reject-application step.
  if (decision === "rejected") {
    await supabase
      .from("contractor_profiles")
      .update({ verification_status: "changes_requested" })
      .eq("user_id", contractorId);
  }

  revalidatePath("/admin/review");
  revalidatePath("/contractor/status");
}

export async function approveContractor(contractorId: string) {
  const { supabase } = await assertAdmin();

  // Guard: every required document must be approved before the overall
  // application can be approved. Prevents a mis-click from activating an
  // under-verified contractor.
  const { data: docs } = await supabase
    .from("contractor_documents")
    .select("status, document_requirements(is_required)")
    .eq("contractor_id", contractorId);

  const missingApproval = docs?.some(
    (d: any) => d.document_requirements?.is_required && d.status !== "approved"
  );
  if (missingApproval) {
    throw new Error("All required documents must be approved before approving this contractor.");
  }

  const { error } = await supabase
    .from("contractor_profiles")
    .update({ verification_status: "approved" })
    .eq("user_id", contractorId);

  if (error) throw error;

  revalidatePath("/admin/review");
  revalidatePath("/contractor/status");
}

export async function rejectApplication(contractorId: string) {
  const { supabase } = await assertAdmin();

  const { error } = await supabase
    .from("contractor_profiles")
    .update({ verification_status: "changes_requested" })
    .eq("user_id", contractorId);

  if (error) throw error;

  revalidatePath("/admin/review");
  revalidatePath("/contractor/status");
}
