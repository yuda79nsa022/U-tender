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

export async function addRequirement(formData: FormData) {
  const { supabase, adminId } = await assertAdmin();

  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const isRequired = formData.get("is_required") === "on";

  if (!name?.trim()) throw new Error("Document name is required");

  const { error } = await supabase.from("document_requirements").insert({
    name: name.trim(),
    description: description?.trim() || null,
    is_required: isRequired,
    created_by: adminId,
  });

  if (error) throw error;
  revalidatePath("/admin/requirements");
}

export async function toggleRequired(id: string, isRequired: boolean) {
  const { supabase } = await assertAdmin();
  const { error } = await supabase.from("document_requirements").update({ is_required: isRequired }).eq("id", id);
  if (error) throw error;
  revalidatePath("/admin/requirements");
}

export async function toggleActive(id: string, isActive: boolean) {
  const { supabase } = await assertAdmin();
  const { error } = await supabase.from("document_requirements").update({ is_active: isActive }).eq("id", id);
  if (error) throw error;
  revalidatePath("/admin/requirements");
}

// Soft-remove: deactivate rather than hard-delete, so existing
// contractor_documents rows referencing this requirement stay intact
// for audit history. A true hard delete is available if you need it,
// but it will cascade-delete every contractor's submission against it.
export async function removeRequirement(id: string) {
  const { supabase } = await assertAdmin();
  const { error } = await supabase.from("document_requirements").update({ is_active: false }).eq("id", id);
  if (error) throw error;
  revalidatePath("/admin/requirements");
}
